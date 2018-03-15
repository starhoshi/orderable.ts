"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Retrycf = require("retrycf");
const Mission = require("mission-completed");
const EventResponse = require("event-response");
const error_1 = require("./error");
const protocol_1 = require("./protocol");
const index_1 = require("./index");
const Tart = require("@star__hoshi/tart");
var Functions;
(function (Functions) {
    class OrderSKUObject {
        static fetchFrom(order) {
            return __awaiter(this, void 0, void 0, function* () {
                const orderSKUQuerySnapshot = yield order.ref.collection('orderSKUs').get();
                const orderSKUObjects = yield Promise.all(orderSKUQuerySnapshot.docs.map(qds => {
                    return Tart.fetch(protocol_1.Path.OrderSKU, qds.ref.id).then(snapshot => {
                        const orderSKUObject = new OrderSKUObject();
                        orderSKUObject.orderSKU = snapshot;
                        return orderSKUObject;
                    });
                }));
                yield Promise.all(orderSKUObjects.map((orderSKUObject, index) => {
                    return orderSKUObject.orderSKU.data.sku.get().then(snapshot => {
                        orderSKUObjects[index].sku = new Tart.Snapshot(snapshot);
                    });
                }));
                return orderSKUObjects;
            });
        }
    }
    Functions.OrderSKUObject = OrderSKUObject;
    let PaymentAgencyType;
    (function (PaymentAgencyType) {
        PaymentAgencyType[PaymentAgencyType["Unknown"] = 0] = "Unknown";
        PaymentAgencyType[PaymentAgencyType["Stripe"] = 1] = "Stripe";
    })(PaymentAgencyType = Functions.PaymentAgencyType || (Functions.PaymentAgencyType = {}));
    class OrderObject {
        constructor(event) {
            this.event = event;
            this.orderID = event.params.orderID;
            this.order = new Tart.Snapshot(event.data);
            this.previousOrder = new Tart.Snapshot(event.data.previous);
        }
        getShops() {
            return __awaiter(this, void 0, void 0, function* () {
                this.shops = yield Promise.all(this.orderSKUObjects.map(orderSKUObject => {
                    return orderSKUObject.orderSKU.data.shop;
                }).filter((shopRef, index, self) => {
                    return self.indexOf(shopRef) === index;
                }).map(shopRef => {
                    return shopRef.get().then(s => { return new Tart.Snapshot(s); });
                }));
            });
        }
        get isCharged() {
            if (this.order && this.order.data.stripe && this.order.data.stripe.chargeID) {
                return true;
            }
            return false;
        }
        get paymentAgencyType() {
            if (!this.order) {
                return PaymentAgencyType.Unknown;
            }
            if (this.order.data.stripe) {
                return PaymentAgencyType.Stripe;
            }
            return PaymentAgencyType.Unknown;
        }
        updateStock(operator, step) {
            const orderSKUObjects = this.orderSKUObjects;
            if (!orderSKUObjects) {
                throw Error('orderSKUObjects must be non-null');
            }
            return index_1.firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                const promises = [];
                for (const orderSKUObject of orderSKUObjects) {
                    const t = transaction.get(orderSKUObject.sku.ref).then(tsku => {
                        const sku = new Tart.Snapshot(tsku);
                        const quantity = orderSKUObject.orderSKU.data.quantity * operator;
                        const newStock = sku.data.stock + quantity;
                        if (sku.data.stockType === protocol_1.StockType.Finite) {
                            if (newStock >= 0) {
                                transaction.update(orderSKUObject.sku.ref, { stock: newStock });
                            }
                            else {
                                throw new error_1.BadRequestError(error_1.ValidationErrorType.OutOfStock, `${orderSKUObject.orderSKU.data.snapshotProduct.name} is out of stock. \nquantity: ${orderSKUObject.orderSKU.data.quantity}, stock: ${orderSKUObject.sku.data.stock}`);
                            }
                        }
                    });
                    promises.push(t);
                }
                return Promise.all(promises);
            }));
        }
    }
    Functions.OrderObject = OrderObject;
    let Operator;
    (function (Operator) {
        Operator[Operator["plus"] = 1] = "plus";
        Operator[Operator["minus"] = -1] = "minus";
    })(Operator = Functions.Operator || (Functions.Operator = {}));
    const validateOrderExpired = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            if (orderObject.isCharged) {
                return orderObject;
            }
            if (!order.data.expirationDate) {
                return orderObject;
            }
            if (order.data.expirationDate.getTime() < new Date().getTime()) {
                throw new error_1.BadRequestError(error_1.ValidationErrorType.OrderExpired, 'The order has expired.');
            }
            return orderObject;
        }
        catch (error) {
            if (error.constructor === error_1.BadRequestError) {
                const brError = error;
                orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message);
                throw new error_1.OrderableError('validateOrderExpired', error_1.ErrorType.BadRequest, error);
            }
            throw new error_1.OrderableError('validateOrderExpired', error_1.ErrorType.Internal, error);
        }
    });
    const preventStepName = 'preventMultipleProcessing';
    const preventMultipleProcessing = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (orderObject.isCharged) {
                return orderObject;
            }
            const completed = yield Mission.markCompleted(orderObject.order.ref, preventStepName);
            orderObject.order.data.completed = completed;
            return orderObject;
        }
        catch (error) {
            if (error.constructor === Mission.CompletedError) {
                throw new error_1.OrderableError(preventStepName, error_1.ErrorType.Completed, error);
            }
            // if not CompletedError, it maybe firebase internal error, because retry.
            orderObject.order.data.retry = yield Retrycf.setRetry(orderObject.order.ref, orderObject.order.data, error);
            throw new error_1.OrderableError(preventStepName, error_1.ErrorType.Retry, error);
        }
    });
    const prepareRequiredData = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            orderObject.user = yield order.data.user.get().then(s => { return new Tart.Snapshot(s); });
            const orderSKUObjects = yield OrderSKUObject.fetchFrom(order);
            orderObject.orderSKUObjects = orderSKUObjects;
            yield orderObject.getShops();
            if (orderObject.paymentAgencyType === PaymentAgencyType.Stripe) {
                const stripeCard = yield index_1.stripe.customers.retrieveCard(order.data.stripe.customerID, order.data.stripe.cardID);
                orderObject.stripeCard = stripeCard;
            }
            return orderObject;
        }
        catch (error) {
            // This error may be a data preparetion error. In that case, it will be solved by retrying.
            orderObject.order.data.retry = yield Retrycf.setRetry(orderObject.order.ref, orderObject.order.data, error);
            throw new error_1.OrderableError(preventStepName, error_1.ErrorType.Retry, error);
        }
    });
    const validateShopIsActive = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const shops = orderObject.shops;
            if (orderObject.isCharged) {
                return orderObject;
            }
            shops.forEach((shop, index) => {
                if (!shop.data.isActive) {
                    throw new error_1.BadRequestError(error_1.ValidationErrorType.ShopIsNotActive, `Shop: ${shop.data.name} is not active.`);
                }
            });
            return orderObject;
        }
        catch (error) {
            if (error.constructor === error_1.BadRequestError) {
                const brError = error;
                orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message);
                throw new error_1.OrderableError('validateShopIsActive', error_1.ErrorType.BadRequest, error);
            }
            orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message);
            throw new error_1.OrderableError('validateShopIsActive', error_1.ErrorType.Internal, error);
        }
    });
    const validateSKUIsActive = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const orderSKUObjects = orderObject.orderSKUObjects;
            if (orderObject.isCharged) {
                return orderObject;
            }
            orderSKUObjects.forEach((orderSKUObject, index) => {
                if (!orderSKUObject.sku.data.isActive) {
                    throw new error_1.BadRequestError(error_1.ValidationErrorType.SKUIsNotActive, `Product: ${orderSKUObject.orderSKU.data.snapshotProduct.name}」 is not active.`);
                }
            });
            return orderObject;
        }
        catch (error) {
            if (error.constructor === error_1.BadRequestError) {
                const brError = error;
                orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message);
                throw new error_1.OrderableError('validateSKUIsActive', error_1.ErrorType.BadRequest, error);
            }
            orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message);
            throw new error_1.OrderableError('validateSKUIsActive', error_1.ErrorType.Internal, error);
        }
    });
    const validatePaymentMethod = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            if (orderObject.isCharged) {
                return orderObject;
            }
            switch (orderObject.paymentAgencyType) {
                case PaymentAgencyType.Stripe:
                    const stripeCard = orderObject.stripeCard;
                    const now = new Date(new Date().getFullYear(), new Date().getMonth());
                    const expiredDate = new Date(stripeCard.exp_year, stripeCard.exp_month - 1);
                    if (expiredDate < now) {
                        throw new error_1.BadRequestError(error_1.ValidationErrorType.StripeCardExpired, 'This card is expired.');
                    }
                    break;
                default:
                    throw new error_1.BadRequestError(error_1.ValidationErrorType.PaymentInfoNotFound, 'Payment information is not registered.');
            }
            return orderObject;
        }
        catch (error) {
            if (error.constructor === error_1.BadRequestError) {
                const brError = error;
                orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message);
                throw new error_1.OrderableError('validatePaymentMethod', error_1.ErrorType.BadRequest, error);
            }
            orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message);
            throw new error_1.OrderableError('validatePaymentMethod', error_1.ErrorType.Internal, error);
        }
    });
    const validateAndDecreaseStock = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (orderObject.isCharged) {
                return orderObject;
            }
            yield orderObject.updateStock(Operator.minus, 'validateAndDecreaseStock');
            return orderObject;
        }
        catch (error) {
            // clear completed mark for retry.
            orderObject.order.data.completed = yield Mission.remove(orderObject.order.ref, preventStepName);
            if (error.constructor === error_1.BadRequestError) {
                const brError = error;
                orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message);
                throw new error_1.OrderableError('validateAndDecreaseStock', error_1.ErrorType.BadRequest, error);
            }
            orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message);
            throw new error_1.OrderableError('validateAndDecreaseStock', error_1.ErrorType.Internal, error);
        }
    });
    const stripeCharge = (order) => __awaiter(this, void 0, void 0, function* () {
        return yield index_1.stripe.charges.create({
            amount: order.data.amount,
            currency: order.data.currency,
            customer: order.data.stripe.customerID,
            source: order.data.stripe.cardID,
            transfer_group: order.ref.id,
            metadata: {
                orderID: order.ref.id
            }
        }, {
            idempotency_key: order.ref.id
        }).catch(e => {
            throw new error_1.StripeError(e);
        });
    });
    const payment = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const user = orderObject.user;
            if (orderObject.isCharged) {
                return orderObject;
            }
            switch (orderObject.paymentAgencyType) {
                case PaymentAgencyType.Stripe:
                    orderObject.stripeCharge = yield stripeCharge(order);
                    break;
                default:
            }
            return orderObject;
        }
        catch (error) {
            // Since stripe.charge failed after reducing stock count, restore stock quantity.
            yield orderObject.updateStock(Operator.plus);
            orderObject.order.data.completed = yield Mission.remove(orderObject.order.ref, preventStepName);
            if (error.constructor === error_1.StripeError) {
                const stripeError = error;
                const errorType = yield stripeError.setError(orderObject.order, 'payment');
                throw new error_1.OrderableError('payment', errorType, error);
            }
            orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message);
            throw new error_1.OrderableError('payment', error_1.ErrorType.Internal, error);
        }
    });
    /**
     * Save peyment succeeded information.
     * Set fatal error if this step failed.
     */
    const savePaymentCompleted = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const batch = index_1.firestore.batch();
            if (orderObject.isCharged) {
                return orderObject;
            }
            switch (orderObject.paymentAgencyType) {
                case PaymentAgencyType.Stripe:
                    const charge = orderObject.stripeCharge;
                    order.data.paymentStatus = protocol_1.OrderPaymentStatus.Paid;
                    order.data.stripe.chargeID = charge.id;
                    order.data.paidDate = new Date();
                    batch.update(order.ref, {
                        paymentStatus: protocol_1.OrderPaymentStatus.Paid,
                        stripe: orderObject.order.data.stripe,
                        paidDate: new Date(),
                        updatedAt: new Date()
                    });
                    break;
                default:
            }
            yield index_1.firestore.collection(protocol_1.Path.OrderShop)
                .where('order', '==', order.ref)
                .get()
                .then(snapshot => {
                // Only when paymentStatus is OrderShopPaymentStatus.Created, updates to OrderShopPaymentStatus.Paid.
                snapshot.docs.filter(s => {
                    const orderShop = new Tart.Snapshot(s);
                    return orderShop.data.paymentStatus === protocol_1.OrderShopPaymentStatus.Created;
                }).forEach(doc => {
                    batch.update(doc.ref, {
                        paymentStatus: protocol_1.OrderShopPaymentStatus.Paid,
                        updatedAt: new Date()
                    });
                });
            });
            yield batch.commit();
            console.log('charge completed');
            return orderObject;
        }
        catch (error) {
            // If this step failed, we can not remember chargeID. Because set fatal error.
            orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message);
            throw new error_1.OrderableError('updateOrder', error_1.ErrorType.Internal, error);
        }
    });
    const setOrderTask = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setOK();
            return orderObject;
        }
        catch (error) {
            // This step fails only when update error occurs. Because set retry.
            orderObject.order.data.retry = yield Retrycf.setRetry(orderObject.order.ref, orderObject.order.data, error);
            throw new error_1.OrderableError('setOrderTask', error_1.ErrorType.Retry, error);
        }
    });
    /**
     * Start order processing.
     * @param orderObject
     */
    Functions.orderPaymentRequested = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const retryStatus = Retrycf.retryStatus(orderObject.order.data, orderObject.previousOrder.data);
            if (retryStatus === Retrycf.Status.RetryFailed) {
                orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setInternalError('orderPaymentRequested', 'Retry Failed');
                throw new error_1.OrderableError('orderPaymentRequested', error_1.ErrorType.Internal, new error_1.RetryFailedError('orderPaymentRequested', orderObject.order.data.retry.errors.toString()));
            }
            // If order.paymentStatus update to PaymentRequested or should retry is true, continue processing.
            if (orderObject.previousOrder.data.paymentStatus !== orderObject.order.data.paymentStatus && orderObject.order.data.paymentStatus === protocol_1.OrderPaymentStatus.PaymentRequested) {
                // continue
            }
            else {
                if (retryStatus !== Retrycf.Status.ShouldRetry) {
                    return undefined; // not continue
                }
            }
            yield validateOrderExpired(orderObject);
            yield prepareRequiredData(orderObject);
            yield validateShopIsActive(orderObject);
            yield validateSKUIsActive(orderObject);
            yield validatePaymentMethod(orderObject);
            yield preventMultipleProcessing(orderObject);
            yield validateAndDecreaseStock(orderObject);
            yield payment(orderObject);
            yield savePaymentCompleted(orderObject);
            yield setOrderTask(orderObject);
            return Promise.resolve();
        }
        catch (error) {
            if (error.constructor !== error_1.OrderableError) {
                orderObject.order.data.result = yield new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message);
                throw new error_1.OrderableError('orderPaymentRequested', error_1.ErrorType.Internal, error);
            }
            return Promise.reject(error);
        }
    });
})(Functions = exports.Functions || (exports.Functions = {}));
