const io = require("socket.io")(9000, {
  cors: "*",
});

let activeUsers = [];

//init socket server

io.on("connection", (socket) => {
  console.log("Client side is connected!");

  //set active user to socket
  socket.on("setActiveUser", (data) => {
    const checkActiveUser = activeUsers.some((d) => d._id === data._id);

    if (!checkActiveUser) {
      activeUsers.push({
        userId: data._id,
        socketId: socket.id,
        user: data,
      });
    }

    io.emit("getActiveUser", activeUsers);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected!");

    //remove active user from socket
    activeUsers = activeUsers.filter((data) => data.socketId !== socket.id);
    io.emit("getActiveUser", activeUsers);
  });
});
