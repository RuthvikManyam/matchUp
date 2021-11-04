const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware.js");
const UserModel = require("../models/User");
const DateModel = require("../models/Date");
const WrapAsync = require('../utils/WrapAsync');
const passport = require("passport");
const { storage } = require("../cloudinary/index.js");
const multer = require("multer");
const Joi = require("joi");
const upload = multer({ storage });
const AppError = require('../utils/AppError');
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocoder = mbxGeocoding({ accessToken: mapBoxToken });

router.get("/", WrapAsync(async (req, res) => {
    req.session.isAuth = true;
    res.render("home.ejs");
}))

router.get("/dashboard", isLoggedIn, WrapAsync(async (req, res) => {
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


router.get("/logout", isLoggedIn, (req, res) => {
    req.logout();
    req.flash("success", "Successfully logged out!");
    res.redirect("/");
})

router.post("/login", passport.authenticate("local", { failureFlash: true, failureRedirect: "/" }), (req, res) => {
    req.flash("success", "Welcome back!");
    res.redirect("/dashboard");
})

router.post("/register", upload.array("image"), WrapAsync(async (req, res, next) => {
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


    const geodata = await geocoder.forwardGeocode({
        query: req.body.city,
        limit: 1
    }).send();
    const { email, username, password, city, profileDescription, gender, genderPreference, dob, ageRange } = req.body;
    if (req.files.length == 0) {
        throw new AppError("You haven't upload your image(s)!", 400);
    }
    const user = new UserModel({ email, username, city, profileDescription, gender, genderPreference, dob, ageRange });
    user.images = req.files.map(f => ({ url: f.path, filename: f.filename }));
    user.geometry = geodata.body.features[0].geometry;
    const registeredUser = await UserModel.register(user, password);
    req.login(registeredUser, async (error) => {
        if (error) return next(error);
        await user.save();
        req.flash("success", "Successfully registered!");
        res.redirect("/dashboard");
    })
}));


router.get("/:id", isLoggedIn, WrapAsync(async (req, res) => {
    const { id } = req.params;
    const user = await UserModel.findById(id);
    res.render("profile.ejs", { user });
}))


module.exports = router;