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
    res.locals.helperScripts = require("./utils/helperScripts");
    res.locals.success = req.flash("success");
    res.locals.info = req.flash("info");
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
    await req.user.populate({
        path: 'dates',
        model: 'Date',
        populate: [{
            path: 'sender',
            model: 'User'
        },
        {
            path: 'receiver',
            model: 'User'
        }]
    })
    const dateRequests = [];
    const scheduledDates = [];
    for (let date of req.user.dates) {
        if ((req.user._id.valueOf() == date.receiver._id.valueOf()) && date.status == "pending") {
            dateRequests.push(date);
        }
        else if ((req.user._id.valueOf() == date.receiver._id.valueOf() ||
            (req.user._id.valueOf() == date.sender._id.valueOf()) &&
            date.status == "accepted")) {
            scheduledDates.push(date);
        }
    }
    res.render("dashboard.ejs", { users, potentialMatchUps, dateRequests, scheduledDates });
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

app.post("/register", upload.array("image"), WrapAsync(async (req, res, next) => {
    const registrationValidationSchema = Joi.object({
        email: Joi.string().required(),
        username: Joi.string().required(),
        password: Joi.string().required(),
        city: Joi.string().required(),
        profileDescription: Joi.string().required(),
        gender: Joi.string().required(),
        genderPreference: Joi.string().required(),
        ageRange: Joi.string().required(),
        dob: Joi.date().required()
    });

    const { error } = registrationValidationSchema.validate(req.body);
    if (error) {
        const messages = error.details.map(elt => elt.message).join(",");
        throw new AppError(messages, 400);
    }

    const { email, username, password, city, profileDescription, gender, genderPreference, dob, ageRange } = req.body;
    if (req.files.length == 0) {
        throw new AppError("You haven't upload your image(s)!", 400);
    }
    const user = new UserModel({ email, username, city, profileDescription, gender, genderPreference, dob, ageRange });
    user.images = req.files.map(f => ({ url: f.path, filename: f.filename }));
    const registeredUser = await UserModel.register(user, password);
    req.login(registeredUser, async (error) => {
        if (error) return next(error);
        await user.save();
        req.flash("success", "Successfully registered!");
        res.redirect("/dashboard");
    })
}));


app.post("/match/add/:id", isLoggedIn, WrapAsync(async (req, res) => {
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

app.post("/match/accept/:id", isLoggedIn, WrapAsync(async (req, res) => {
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


app.post("/match/reject/:id", isLoggedIn, WrapAsync(async (req, res) => {
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


app.get("/:id", async (req, res) => {
    const { id } = req.params;
    const user = await UserModel.findById(id);
    res.render("profile.ejs", { user });
})



app.get("/date/:recipient", async (req, res) => {
    const recipient = await UserModel.findById(req.params.recipient);
    res.render("dateScheduler.ejs", { recipient });
})

app.post("/date/:recipient", async (req, res) => {
    const date = new DateModel({ sender: req.user._id, receiver: req.params.recipient, status: "pending", location: req.body.location, date: req.body.dod });
    await date.save();
    await UserModel.findOneAndUpdate({ _id: req.user._id }, { $push: { dates: date._id } });
    await UserModel.findOneAndUpdate({ _id: req.params.recipient }, { $push: { dates: date._id } });
    req.flash("success", "Sent a date request!");
    res.redirect("/dashboard");
})

app.post("/date/accept/:dateID", async (req, res) => {
    const date = await DateModel.findById(req.params.dateID);
    date.status = "accepted";
    await date.save();
    req.flash("success", "You have a new date!");
    res.redirect("/dashboard");
})


app.post("/date/reject/:dateID", async (req, res) => {
    const date = await DateModel.findById(req.params.dateID);

    await UserModel.findOneAndUpdate(
        { _id: date.sender._id },
        { $pull: { dates: req.params.dateID } }
    );
    await UserModel.findOneAndUpdate(
        { _id: date.receiver._id },
        { $pull: { dates: req.params.dateID } }
    );
    await DateModel.findOneAndDelete({ _id: req.params.dateID });
    req.flash("info", "Rejected the date request");
    res.redirect("/dashboard");
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

