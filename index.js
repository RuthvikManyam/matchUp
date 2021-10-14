if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const { storage } = require("./cloudinary/index.js");
const multer = require("multer");
const upload = multer({ storage });
const passport = require("passport");
const localStrategy = require("passport-local");
const session = require("express-session");
const flash = require("connect-flash");
const UserModel = require("./models/User");
const ejsMate = require("ejs-mate");
const { isLoggedIn } = require("./middleware.js");
mongoose.connect('mongodb://localhost:27017/matchUp')
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.log(err));

const app = express();

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
    }
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
    res.render("home.ejs");
})

app.get("/dashboard", isLoggedIn, async (req, res) => {
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
    console.log(potentialMatchUps);
    console.log(req.user);
    await req.user.populate("friendRequests");
    await req.user.populate("sentRequests");
    await req.user.populate("friends");
    res.render("dashboard.ejs", { users, potentialMatchUps });
})

app.get("/logout", isLoggedIn, (req, res) => {
    req.logout();
    req.flash("success", "Successfully logged out!");
    res.redirect("/");
})

app.post("/login", passport.authenticate("local", { failureFlash: true, failureRedirect: "/" }), (req, res) => {
    req.flash("success", "Welcome back!");
    res.redirect("/dashboard");
})

//ensure authentication
app.post("/register", isLoggedIn, upload.single("image"), async (req, res) => {
    try {
        console.log(req.file);
        const { email, username, password, city, image } = req.body;
        const user = new UserModel({ email, username, city, image });
        const registeredUser = await UserModel.register(user, password);
        req.login(registeredUser, error => {
            if (error) return next(error);
            req.flash("success", "Successfully registered!");
            res.redirect("/dashboard");
        })
    }
    catch (err) {
        req.flash("error", err.message);
        res.redirect("/");
    }
});

app.post("/:id/add", isLoggedIn, async (req, res) => {
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
})

app.post("/:id/accept", isLoggedIn, async (req, res) => {
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
})


//ensure authentication
app.post("/:id/reject", isLoggedIn, async (req, res) => {
    const user1 = req.user;
    const user2 = await UserModel.findById(req.params.id);
    await UserModel.findByIdAndUpdate(
        user2._id, { $pull: { sentRequests: user1._id } });
    await UserModel.findByIdAndUpdate(
        user1._id, { $pull: { friendRequests: user2._id } });
    req.flash("info", "matchUp rejected!");
    res.redirect("/dashboard");
})

app.listen(3000, () => {
    console.log(`Listening on port 3000`);
})