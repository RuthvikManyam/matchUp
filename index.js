const express = require("express");
const app = express();
const mongoose = require("mongoose");
mongoose.connect('mongodb://localhost:27017/matchUp')
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.log(err));
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const MongoDBSession = require("connect-mongodb-session")(session);
const TWO_HOURS = 1000 * 60 * 60 * 2;
const MongoDBstore = new MongoDBSession({
    uri: "mongodb://localhost:27017/matchUp",
    collection: "sessions"
});
const UserModel = require("./models/User");
const { resourceLimits } = require("worker_threads");
const {
    PORT = 3000,
    SESSION_SECRET = 'defaultSecretKey',
    SESSION_LIFETIME = TWO_HOURS
} = process.env
const sessionConfig = {
    secret: SESSION_SECRET,
    store: MongoDBstore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: true,
        expires: SESSION_LIFETIME,
        maxAge: SESSION_LIFETIME
    }
}
const passport = require("passport");
const localStrategy = require("passport-local");
const User = require("./models/User");

app.use(session(sessionConfig));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(UserModel.authenticate()));
passport.serializeUser(UserModel.serializeUser());
passport.deserializeUser(UserModel.deserializeUser());

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    next();
})
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));


app.get("/", (req, res) => {
    req.session.isAuth = true;
    res.render("home.ejs");
})

app.get("/login", (req, res) => {
    res.render("login.ejs");
})

app.get("/register", (req, res) => {
    res.render("register.ejs");
})

app.get("/dashboard", (req, res) => {
    res.render("dashboard.ejs");
})

app.post("/login", passport.authenticate("local", { failureFlash: true, failureRedirect: "/login" }), (req, res) => {
    req.flash("success", "Welcome back!");
    res.redirect("/dashboard");
})

app.post("/register", async (req, res) => {
    try {
        const { email, username, password } = req.body;
        const user = new User({ email, username });
        const registeredUser = await UserModel.register(user, password);
        console.log(registeredUser);
        req.flash("success", "Successfully registered!");
        res.redirect("/dashboard");
    }
    catch (err) {
        req.flash("error", err.message);
        res.redirect("/register");
    }
});

app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
})