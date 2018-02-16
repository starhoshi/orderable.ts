"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const FirebaseFirestore = require("@google-cloud/firestore");
const Stripe = require("stripe");
const pring_1 = require("pring");
const Retrycf = require("retrycf");
const Mission = require("mission-completed");
const EventResponse = require("event-response");
__export(require("./util"));
__export(require("./error"));
__export(require("./protocol"));
__export(require("./function"));
let adminOptions;
exports.initialize = (options) => {
    pring_1.Pring.initialize(options.adminOptions);
    Retrycf.initialize(options.adminOptions);
    Mission.initialize(options.adminOptions);
    EventResponse.initialize(options.adminOptions);
    EventResponse.configure({ collectionPath: 'version/1/failure' });
    exports.firestore = new FirebaseFirestore.Firestore(options.adminOptions);
    exports.stripe = new Stripe(options.stripeToken);
    adminOptions = options.adminOptions;
};
