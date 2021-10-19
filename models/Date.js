const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const dateSchema = new Schema({
    sender: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    receiver: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    status: {
        type: String,
        enum: ['pending', 'accepted'],
        required: true
    },
    location: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        min: '2021-01-01',
        max: '2050-12-31',
        required: true
    }
});

module.exports = mongoose.model("Date", dateSchema);