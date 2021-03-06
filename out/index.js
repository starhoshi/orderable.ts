"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const Stripe = require("stripe");
const Retrycf = require("retrycf");
const Mission = require("mission-completed");
const EventResponse = require("event-response");
const Tart = require("@star__hoshi/tart");
__export(require("./error"));
__export(require("./protocol"));
__export(require("./function"));
exports.initialize = (options) => {
    exports.firestore = options.firestore;
    Tart.initialize(exports.firestore);
    Retrycf.initialize(exports.firestore);
    Mission.initialize(exports.firestore);
    EventResponse.initialize(exports.firestore);
    exports.stripe = new Stripe(options.stripeToken);
};
