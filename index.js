if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const express = require("express");
const path = require("path");
const Joi = require("joi");
const mongoose = require("mongoose");
const { storage } = require("./cloudinary/index.js");
const multer = require("multer");
const upload = multer({ storage });
const passport = require("passport");
const localStrategy = require("passport-local");
const session = require("express-session");
const MongoDBSession = require('connect-mongodb-session')(session);
const flash = require("connect-flash");
const UserModel = require("./models/User");
const WrapAsync = require('./utils/WrapAsync');
const AppError = require('./utils/AppError');
const ejsMate = require("ejs-mate");
const mongoURI = 'mongodb://localhost:27017/matchUp'
mongoose.connect(mongoURI)
const { isLoggedIn } = require("./middleware.js");
const Conversation = require("./models/Conversation.js");
const Message = require("./models/Message.js");
mongoose.connect('mongodb://localhost:27017/matchUp')
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.log(err));

const app = express();
const axios = require('axios');
const server = require("http").createServer(app);
const io = require("socket.io")(server, { cors: { origin: "*" } })

const store = new MongoDBSession({
    uri: mongoURI,
    collection: 'mysessions'
})

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));

const sessionConfig = {
    secret: "defaultKey",
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7,
    },
    store: store,
}

app.use(session(sessionConfig));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(UserModel.authenticate()));
passport.serializeUser(UserModel.serializeUser());
passport.deserializeUser(UserModel.deserializeUser());

app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    next();
})

app.get("/", (req, res) => {
    req.session.isAuth = true;
    res.render("home.ejs");
})

app.get("/dashboard", isLoggedIn, WrapAsync(async (req, res) => {
    const users = await UserModel.find({});
    const potentialMatchUps = [];
    for (let user of users) {
        if ((req.user._id.valueOf() !== user._id.valueOf()) &&
            !(req.user.friendRequests.includes(user._id)) &&
            !(req.user.sentRequests.includes(user._id)) &&
            !(req.user.friends.includes(user._id))) {
            potentialMatchUps.push(user);
        }
    }
    await req.user.populate("friendRequests");
    await req.user.populate("sentRequests");
    await req.user.populate("friends");
    res.render("dashboard.ejs", { users, potentialMatchUps });
}))


app.get("/logout", isLoggedIn, (req, res) => {
    req.logout();
    req.flash("success", "Successfully logged out!");
    res.redirect("/");
})

app.post("/login", passport.authenticate("local", { failureFlash: true, failureRedirect: "/" }), (req, res) => {
    req.flash("success", "Welcome back!");
    res.redirect("/dashboard");
})

app.post("/register", upload.single("image"), WrapAsync(async (req, res, next) => {
    const registrationValidationSchema = Joi.object({
        email: Joi.string().required(),
        username: Joi.string().required(),
        password: Joi.string().required(),
        city: Joi.string().required()
    });

    const { error } = registrationValidationSchema.validate(req.body);
    if (error) {
        const messages = error.details.map(elt => elt.message).join(",");
        throw new AppError(messages, 400);
    }

    const { email, username, password, city } = req.body;
    if (!req.file) {
        throw new AppError("File not uploaded", 400);
    }
    const { path, filename } = req.file;
    const user = new UserModel({ email, username, city, image: { url: path, filename: filename } });
    const registeredUser = await UserModel.register(user, password);
    req.login(registeredUser, async (error) => {
        if (error) return next(error);
        await user.save();
        req.flash("success", "Successfully registered!");
        res.redirect("/dashboard");
    })
}));


app.post("/:id/add", isLoggedIn, WrapAsync(async (req, res) => {
    const user1 = req.user;
    const user2 = await UserModel.findById(req.params.id);
    await UserModel.updateOne(
        { _id: user2._id },
        { $push: { friendRequests: user1._id } }
    );
    await UserModel.updateOne(
        { _id: user1._id },
        { $push: { sentRequests: user2._id } }
    );
    req.flash("success", "Sent a matchUp request!");
    res.redirect("/dashboard");
}))

app.post("/:id/accept", isLoggedIn, WrapAsync(async (req, res) => {
    const user1 = req.user;
    const user2 = await UserModel.findById(req.params.id);
    await UserModel.updateOne(
        { _id: user2._id },
        { $push: { friends: user1._id } }
    );
    await UserModel.updateOne(
        { _id: user1._id },
        { $push: { friends: user2._id } }
    );
    await UserModel.findByIdAndUpdate(
        user2._id, { $pull: { sentRequests: user1._id } });
    await UserModel.findByIdAndUpdate(
        user1._id, { $pull: { friendRequests: user2._id } });
    req.flash("success", "You have successfully matched up!");
    res.redirect("/dashboard");
}))


app.post("/:id/reject", isLoggedIn, WrapAsync(async (req, res) => {
    const user1 = req.user;
    const user2 = await UserModel.findById(req.params.id);
    await UserModel.findByIdAndUpdate(
        user2._id, { $pull: { sentRequests: user1._id } });
    await UserModel.findByIdAndUpdate(
        user1._id, { $pull: { friendRequests: user2._id } });
    await UserModel.updateOne(
        { _id: user2._id },
        { $pull: { friends: user1._id } }
    );
    await UserModel.updateOne(
        { _id: user1._id },
        { $pull: { friends: user2._id } }
    );
    req.flash("info", "matchUp rejected!");
    res.redirect("/dashboard");
}))


app.post("/conversations", async (req, res, next) => {
    const newConversation = new Conversation({
        members: [req.body.senderId, req.body.receiverId]
    });
    try {
        const savedConversation = await newConversation.save();
        res.status(200).json(savedConversation);
    }
    catch (err) {
        throw new AppError(err.message, 500);
    }
})

app.get("/conversations/:userId", async (req, res) => {
    try {
        const conversation = await Conversation.find({
            members: { $in: [req.params.userId.valueOf()] }
        });
        res.status(200).json(conversation);
    } catch (err) {
        throw new AppError(err.message, 500);
    }
})


app.post("/messages", async (req, res) => {
    const newMessage = new Message(req.body);
    try {
        const savedMessage = await newMessage.save();
        res.status(200).send(savedMessage);
    } catch (err) {
        throw new AppError(err.message, 500);
    }
})

app.get("/messages/:conversationId", async (req, res) => {
    try {
        const messages = await Message.find({
            conversationId: req.params.conversationId
        });
        res.status(200).send(messages);
    } catch (err) {
        throw new AppError(err.message, 500);
    }
})


app.get("/chat", async (req, res) => {
    const getConversations = async () => {
        try {
            let conversations = await axios.get("http://localhost:3000/conversations/" + req.user._id);
            conversations = conversations.data;
            const conversationFriendDetails = [];
            for (let conversation of conversations) {
                const friendId = conversation.members.find(m => m !== req.user._id.valueOf());
                const friendDetail = await UserModel.findById(friendId);
                conversationFriendDetails.push(friendDetail);
            }
            res.render("chat.ejs", { conversations, conversationFriendDetails });
        } catch (err) {
            console.log(err);
        }
    };
    getConversations();
})



app.all('*', (req, res, next) => {
    next(new AppError('Page Not Found', 404))
})

app.use((err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message("Something went wrong!");
    res.status(statusCode).render("error.ejs", { err });
})

server.listen(3000, () => {
    console.log(`Listening on port 3000`);
})

io.on("connection", (socket) => {
    console.log("USER CONNECTED: " + socket.id);
    socket.on("send-message", (message, room) => {
        if (room === "") {
            socket.broadcast.emit("receive-message", message);
        }
        else {
            socket.to(room).emit("receive-message", message);
        }
    })
})