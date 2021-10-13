const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
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
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.log(err));

const app = express();

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
    console.log(req.session.id);
    req.session.isAuth = true;
    res.render("home.ejs");
})

app.get("/dashboard", WrapAsync (async (req, res) => {
    if (!req.isAuthenticated()) {
        req.flash("error", "You need to be signed in!");
        return res.redirect("/");
    }
    else {
        const users = await UserModel.find({});
        res.render("dashboard.ejs", { users });
    }

}))

app.get("/logout", (req, res) => {
    req.logout();
    req.flash("success", "Successfully logged out!");
    res.redirect("/");
})

app.post("/login", passport.authenticate("local", { failureFlash: true, failureRedirect: "/" }), (req, res) => {
    req.flash("success", "Welcome back!");
    res.redirect("/dashboard");
})

app.post("/register", WrapAsync( async (req, res) => {
    try {
        const { email, username, password, city, image } = req.body;
        let user = await UserModel.findOne({email});
        if(user){
            req.flash("error", "A user with that email ID already exists!");
            res.redirect("/");
        }
        user = new UserModel({ email, username, city, image });
        const registeredUser = await UserModel.register(user, password);
        req.login(registeredUser, async(error) => {
            if (error) return next(error);
            await user.save();
            req.flash("success", "Successfully registered!");
            res.redirect("/dashboard");
        })
    }
    catch (err) {
        req.flash("error", err.message);
        res.redirect("/");
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