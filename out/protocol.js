"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var StockType;
(function (StockType) {
    StockType["Unknown"] = "unknown";
    StockType["Finite"] = "finite";
    StockType["Infinite"] = "infinite";
})(StockType = exports.StockType || (exports.StockType = {}));
var OrderPaymentStatus;
(function (OrderPaymentStatus) {
    OrderPaymentStatus[OrderPaymentStatus["Unknown"] = 0] = "Unknown";
    OrderPaymentStatus[OrderPaymentStatus["Created"] = 1] = "Created";
    OrderPaymentStatus[OrderPaymentStatus["PaymentRequested"] = 2] = "PaymentRequested";
    OrderPaymentStatus[OrderPaymentStatus["WaitingForPayment"] = 3] = "WaitingForPayment";
    OrderPaymentStatus[OrderPaymentStatus["Paid"] = 4] = "Paid";
})(OrderPaymentStatus = exports.OrderPaymentStatus || (exports.OrderPaymentStatus = {}));
var OrderShopPaymentStatus;
(function (OrderShopPaymentStatus) {
    OrderShopPaymentStatus[OrderShopPaymentStatus["Unknown"] = 0] = "Unknown";
    OrderShopPaymentStatus[OrderShopPaymentStatus["Created"] = 1] = "Created";
    OrderShopPaymentStatus[OrderShopPaymentStatus["Paid"] = 2] = "Paid";
})(OrderShopPaymentStatus = exports.OrderShopPaymentStatus || (exports.OrderShopPaymentStatus = {}));
