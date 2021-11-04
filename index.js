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
const DateModel = require("./models/Date");
const WrapAsync = require('./utils/WrapAsync');
const AppError = require('./utils/AppError');
const ejsMate = require("ejs-mate");
const methodOverride = require("method-override");
const mongoURI = 'mongodb://localhost:27017/matchUp'
mongoose.connect(mongoURI)
const { isLoggedIn } = require("./middleware.js");
const User = require("./models/User");
mongoose.connect('mongodb://localhost:27017/matchUp')
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.log(err));

const app = express();
const server = require("http").createServer(app);

const store = new MongoDBSession({
    uri: mongoURI,
    collection: 'mysessions'
})

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(methodOverride("_method"));


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

app.use(async (req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.users = await UserModel.find({});
    res.locals.helperScripts = require("./utils/helperScripts");
    res.locals.success = req.flash("success");
    res.locals.info = req.flash("info");
    res.locals.error = req.flash("error");
    next();
})

const userRoutes = require("./routes/user");
const matchRoutes = require("./routes/match");
const dateRoutes = require("./routes/date");

app.use("/date", dateRoutes);
app.use("/match", matchRoutes);
app.use("/", userRoutes);


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

