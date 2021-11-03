const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware.js");
const WrapAsync = require('../utils/WrapAsync');
const UserModel = require("../models/User");

router.post("/add/:id", isLoggedIn, WrapAsync(async (req, res) => {
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

router.post("/accept/:id", isLoggedIn, WrapAsync(async (req, res) => {
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


router.post("/reject/:id", isLoggedIn, WrapAsync(async (req, res) => {
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


module.exports = router;
