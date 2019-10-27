var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var firebase = require('firebase');
var multer = require('multer');
var port = 2002;

var firebaseConfig = {
    apiKey: "AIzaSyACaQWtVrztG0go-ZmePPvUwBGPbuOuAUI",
    authDomain: "discord2-4b96d.firebaseapp.com",
    databaseURL: "https://discord2-4b96d.firebaseio.com",
    projectId: "discord2-4b96d",
    storageBucket: "discord2-4b96d.appspot.com",
    messagingSenderId: "857957305592",
    appId: "1:857957305592:web:688118018f6745a636ff0d"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

var users = [];
var uzerz = {};
var rooms = [];
var gamerooms = [];
var connections = [];

var database = firebase.database();

app.get('/', function (req, res) {
	res.sendFile('/index.html', {root: '.'})
});

//Upload File Images

app.get('/imgs/favicon.ico', function (reg, res) {
	res.sendFile('/imgs/favicon.ico', {root: '.'});
});

app.get('/imgs/BGImg.png', function (req, res) {
	res.sendFile('/imgs/BGImg.png', {root: '.'});
});

app.get('/imgs/privatechat.png', function (reg, res) {
	res.sendFile('/imgs/privatechat.png', {root: '.'});
});

// Start of Uploading
var path = require('path');

var storage = multer.diskStorage({
	destination: './public/imgs',
	filename: function(req, file, cb) {
		cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
	}
});
var upload = multer({ storage: storage }).single('image');

app.post('/upload', function(req, res) {
	upload(req, res, function (err) {
		if (err) {
			console.log(err);
		} else {
			app.get(`/public/imgs/${req.file.filename}`, function(reqe, resp) {
				resp.sendFile(req.file.path, {root: '.'});
			});
			io.sockets.emit('Image', req.file.path);
			ejs.render('index', {
				uploadmessage: "Successfully Uploaded!"
			});
		}
	});
});
io.on('connection', function (socket) {
	socket.login = false;

	console.log("A User has Opened Login Page!");

	socket.on('disconnect', function(data) {
		if (socket.login == true) {
			socket.emit('disconnection', data);
			users.splice(users.indexOf(socket.username), 1)
			delete uzerz[socket.username];
			updateUsernames(socket.username);
			connections.splice(connections.indexOf(socket), 1);
			console.log("Connected: " + connections.length + " socket(s) connected!");
			io.sockets.emit('SendMessageToClients', 'Server', `${socket.username} has left the Chatroom!`);
		}
	});

	socket.on("Login", function (user, pass) {

		firebase.database().ref('/globalmsgs').once("value").then(function(snapshot) {
			userr = snapshot.val().users.replace(/\s+/g, '').replace(/~/g, " ").split(",");
			messages = snapshot.val().msgs.replace(/\s+/g, '').replace(/~/g, " ").split(",");
			socket.emit('SendCachedData', userr, messages);
		});

		firebase.database().ref('/accounts').once("value").then(function(snapshot) {
			usernames = snapshot.val().users.replace(/\s+/g, '').split(",");
			passwords = snapshot.val().passwords.replace(/\s+/g, '').split(",");

			if (usernames.includes(user) && passwords.includes(pass)) {
				if (usernames.indexOf(user) == passwords.indexOf(pass)) {
					socket.username = user;
					socket.login = true;

					users.push(socket.username);
					uzerz[socket.username] = socket

					updateUsernames(socket.username);
					updateRooms();
					io.sockets.emit("SendMessageToClients", "Server", socket.username + " has joined the Chatroom!");

					connections.push(socket);
					console.log("Connected: " + connections.length + " socket(s) connected!");

					socket.emit("Connect", user);
				} else {
					socket.emit("Error", "Login Fail", "Login Failed - Username or Password is incorrect...");
				}
			} else {
				socket.emit("Error", "Login Fail", "Login Failed - Username or Password is incorrect...");
			}
		});
	});

	socket.on("SendMessageToServer", function(user, msg, room) {
		io.sockets.emit("SendMessageToClients", user, msg);

		database.ref('globalmsgs/').once('value').then(function(snapshot) {
			userr = snapshot.val().users;
			messages = snapshot.val().msgs;

			database.ref('globalmsgs/').update({ users: userr + ', ' + user.replace(/\s+/g, '~') });
			database.ref('globalmsgs/').update({ msgs: messages + ', ' + msg.replace(/\s+/g, '~') });
		});
	});

	socket.on("SendPMessageToServer", function(user, msg, dm, room) {
		if (uzerz[dm] == undefined) {
			socket.emit("Error", "Unknown User", "The User you are looking for is either offline or it doesn't exist.");
		} else {
			uzerz[dm].emit('SendPMessage', user, msg);
		}
	});

	socket.on("JoinRoom", function(user, room, left) {
		if (left === "true") {
			socket.leave(room);
			socket.room = "";
			socket.emit("Error", "Alert", `${user}, you have left the Room ${room}`)
		} else if (!(rooms.includes(room))) {
			rooms.push(room);
			socket.room = room;
			socket.emit("JoinedRoom", room);
			socket.join(room);
			updateRooms();
			io.in(room).emit("SendMessageToGroup", "Server", user + " has joined " + room);
		} else if (rooms.includes(room)) {
			socket.room = room;
			socket.emit("JoinedRoom", room);
			socket.join(room);
			io.in(room).emit("SendMessageToGroup", "Server", user + " has joined " + room);
		}
	});

	socket.on("SendGroupMessage", function(user, msg) {
		io.in(socket.room).emit("SendMessageToGroup", user, msg);
	});

	socket.on("Register Account", function(user, password) {

		database.ref('accounts/').once('value').then(function(snapshot) {
			usernames = snapshot.val().users
			passwords = snapshot.val().passwords

			database.ref('accounts/').update({ users: `${usernames}, ${user}` });
			database.ref('accounts/').update({ passwords: `${passwords}, ${password}` });
		});

		database.ref('users/' + user).child('friends').set("");

		socket.emit('Error', 'Successful Register', "You're Account was successfully registered!... Now please Login.");
	});

	socket.on("AddFriend", function(user) {
		database.ref('users/' + socket.username).once('value').then(function(snapshot) {
			friends = snapshot.val().friends;
			friendsarray = snapshot.val().friends.replace(/\s+/g, '').split(",");

			if (friendsarray.includes(user)) {
				socket.emit('Error', 'Friend', `You already have ${user} as a friend...`);
			} else if (friends === "") {
				database.ref('users/' + socket.username).update({ friends: `${user}` });
				updateUsernames(socket.username);
			} else {
				database.ref('users/' + socket.username).update({ friends: `${friends}, ${user}` });
				updateUsernames(socket.username);
			}
		}).catch(function(err) {
			console.log(err);
			correcterror();
		});
	});

	socket.on('OnImageUp', function(user) {
		io.sockets.emit('UploadImage', user);
	});

	socket.on("commands", function(command, args) {
		if (command === "kick") {
			uzerz[args[0]].emit('Error', 'Disconnect', args[1]);
			uzerz[args[0]].disconnect();
		} else if (command === "ipban") {
			return 0;
		}
	});

	function correcterror() {
		database.ref('users/' + socket.username).child('friends').set("");
	}

	function updateUsernames(user) {
		database.ref('users/' + user).once('value').then(function(snapshot) {
			friends = snapshot.val().friends;
			io.sockets.emit('GetUsers', users, friends);
		}).catch(function(err) {
			correcterror();
			io.sockets.emit('GetUsers', users);
		});
	}

	function updateRooms() {
		io.sockets.emit('GetRooms', rooms);
	}



	// All code below is for PONG.

	socket.on("CreateGRoom", function(roomcode) {
		socket.join(roomcode);
		gamerooms.push(roomcode);

		io.sockets.emit("SendMessageToClients", "Server", socket.username + " has created a Pong game!");
	});

	socket.on("JoinGameRoom", function(roomcode) {
		if (gamerooms.includes(roomcode)) {
			socket.join(roomcode);
			io.in(roomcode).emit("UserJoinedRoom", socket.username);
			delete gamerooms[roomcode];
		}
	});

	socket.on("HostInfo", function(hostname, roomcode) {
		io.in(roomcode).emit("Host2Client", hostname);
	});

	socket.on("ClientInfo", function(clientname, roomcode) {
		io.in(roomcode).emit("Client2Host", clientname);
	});

	socket.on("StartedGame", function(screen, roomcode) {
		io.in(roomcode).emit("ClientUpdate", "switchscreen", screen);
	});

	socket.on("GameUpdate", function(host, px, py, ballx, bally, score, score3, roomcode) {
		if (host == true) {
			io.in(roomcode).emit("ClientUpdate", "Game", "Pos", px, py, ballx, bally, score, score3);
		} else if (host == false) {
			io.in(roomcode).emit("HostUpdate", "Game", "", px, py);
		}
	});

});

server.listen(port, function(){
  console.log('listening on *:' + port);
});
