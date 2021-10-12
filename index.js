const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const passport = require("passport");
const localStrategy = require("passport-local");
const session = require("express-session");
const flash = require("connect-flash");
const UserModel = require("./models/User");
const WrapAsync = require('./utils/WrapAsync');
const AppError = require('./utils/AppError');
const ejsMate = require("ejs-mate");
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

app.get("/login", (req, res) => {
    res.render("login.ejs");
})

app.get("/dashboard", (req, res) => {
    if (!req.isAuthenticated()) {
        req.flash("error", "You need to be signed in!");
        return res.redirect("/login");
    }
    res.render("dashboard.ejs");
})

app.get("/logout", (req, res) => {
    req.logout();
    req.flash("success", "Successfully logged out!");
    res.redirect("/");
})

app.post("/login", passport.authenticate("local", { failureFlash: true, failureRedirect: "/login" }), (req, res) => {
    req.flash("success", "Welcome back!");
    res.redirect("/dashboard");
})

app.post("/register", WrapAsync( async (req, res) => {
    try {
        const { email, username, password, city } = req.body;
        const user = new UserModel({ email, username, city });
        const registeredUser = await UserModel.register(user, password);
        req.login(registeredUser, error => {
            if (error) return next(error);
            req.flash("success", "Successfully registered!");
            res.redirect("/dashboard");
        })
    }
    catch (err) {
        req.flash("error", err.message);
        res.redirect("/register");
    }
}));

app.all('*', (req, res , next) => {
    next(new AppError('Page Not Found', 404))
})

app.use((err, req, res, next) => {
    const { statusCode = 500, message = 'Something went wrong!' } = err;
    res.status(statusCode).send(message);
})

app.listen(3000, () => {
    console.log(`Listening on port 3000`);
})