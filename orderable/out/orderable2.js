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
const FirebaseFirestore = require("@google-cloud/firestore");
const Stripe = require("stripe");
const pring_1 = require("pring");
// import * as Retrycf from 'retrycf'
const Retrycf = require("./retrycf");
const Flow = require("@1amageek/flow");
const Mission = require("mission-completed");
const EventResponse = require("event-response");
let stripe;
let firestore;
let adminOptions;
exports.initialize = (options) => {
    pring_1.Pring.initialize(options.adminOptions);
    Retrycf.initialize(options.adminOptions);
    Mission.initialize(options.adminOptions);
    EventResponse.initialize(options.adminOptions);
    EventResponse.configure({ collectionPath: 'version/1/failure' });
    firestore = new FirebaseFirestore.Firestore(options.adminOptions);
    stripe = new Stripe(options.stripeToken);
    adminOptions = options.adminOptions;
};
var ValidationErrorType;
(function (ValidationErrorType) {
    ValidationErrorType["ShopIsNotActive"] = "ShopIsNotActive";
    ValidationErrorType["SKUIsNotActive"] = "SKUIsNotActive";
    ValidationErrorType["OutOfStock"] = "OutOfStock";
    ValidationErrorType["StripeCardError"] = "StripeCardError";
    ValidationErrorType["StripeInvalidRequestError"] = "StripeInvalidRequestError";
    ValidationErrorType["StripeCardExpired"] = "StripeCardExpired";
    ValidationErrorType["PaymentInfoNotFound"] = "PaymentInfoNotFound";
})(ValidationErrorType = exports.ValidationErrorType || (exports.ValidationErrorType = {}));
class PringUtil {
    static collectionPath(model) {
        return `version/${model.getVersion()}/${model.getModelName()}`;
    }
    static get(klass, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = new klass();
            return firestore.collection(PringUtil.collectionPath(model)).doc(id).get().then(s => {
                model.init(s);
                return model;
            });
        });
    }
}
exports.PringUtil = PringUtil;
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
class BaseError extends Error {
    constructor(id, message) {
        super(message);
        Object.defineProperty(this, 'id', {
            get: () => id
        });
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = (new Error()).stack;
        }
    }
    toString() {
        return this.name + ': ' + this.id + ': ' + this.message;
    }
}
exports.BaseError = BaseError;
class BadRequestError extends BaseError {
    constructor(id, message) {
        super(id, message);
    }
}
exports.BadRequestError = BadRequestError;
var ErrorType;
(function (ErrorType) {
    ErrorType["Retry"] = "Retry";
    ErrorType["Completed"] = "Completed";
    ErrorType["BadRequest"] = "BadRequest";
    ErrorType["Internal"] = "Internal";
})(ErrorType = exports.ErrorType || (exports.ErrorType = {}));
class OrderableError extends Error {
    constructor(step, errorType, error) {
        super(`An error occurred in step: ${step}`);
        this.error = error;
        Object.defineProperty(this, 'step', {
            get: () => step
        });
        Object.defineProperty(this, 'type', {
            get: () => errorType
        });
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = (new Error()).stack;
        }
    }
}
exports.OrderableError = OrderableError;
var StripeErrorType;
(function (StripeErrorType) {
    StripeErrorType["StripeCardError"] = "StripeCardError";
    StripeErrorType["RateLimitError"] = "RateLimitError";
    StripeErrorType["StripeInvalidRequestError"] = "StripeInvalidRequestError";
    // An error occurred internally with Stripe's API
    StripeErrorType["StripeAPIError"] = "StripeAPIError";
    StripeErrorType["StripeConnectionError"] = "StripeConnectionError";
    StripeErrorType["StripeAuthenticationError"] = "StripeAuthenticationError";
    StripeErrorType["UnexpectedError"] = "UnexpectedError";
})(StripeErrorType = exports.StripeErrorType || (exports.StripeErrorType = {}));
class StripeError extends Error {
    constructor(error) {
        super();
        if (!error.type) {
            console.error(error);
            throw 'unexpected stripe error';
        }
        this.error = error;
        this.message = error.message;
        this.statusCode = error.statusCode;
        this.requestId = error.requestId;
        switch (error.type) {
            case 'StripeCardError':
                this.type = StripeErrorType.StripeCardError;
                break;
            case 'RateLimitError':
                this.type = StripeErrorType.RateLimitError;
                break;
            case 'StripeInvalidRequestError':
                this.type = StripeErrorType.StripeInvalidRequestError;
                break;
            case 'StripeAPIError':
                this.type = StripeErrorType.StripeAPIError;
                break;
            case 'StripeConnectionError':
                this.type = StripeErrorType.StripeConnectionError;
                break;
            case 'StripeAuthenticationError':
                this.type = StripeErrorType.StripeAuthenticationError;
                break;
            default:
                this.type = StripeErrorType.UnexpectedError;
                break;
        }
    }
    setError(model, step) {
        return __awaiter(this, void 0, void 0, function* () {
            let errorType = ErrorType.Internal;
            switch (this.type) {
                // validate
                case StripeErrorType.StripeCardError: {
                    errorType = ErrorType.BadRequest;
                    model.result = yield new EventResponse.Result(model.reference).setBadRequest(ValidationErrorType.StripeCardError, `${this.type}: ${this.message}`);
                    break;
                }
                case StripeErrorType.StripeInvalidRequestError: {
                    errorType = ErrorType.BadRequest;
                    model.result = yield new EventResponse.Result(model.reference).setBadRequest(ValidationErrorType.StripeInvalidRequestError, `${this.type}: ${this.message}`);
                    break;
                }
                // retry
                case StripeErrorType.StripeAPIError:
                case StripeErrorType.StripeConnectionError:
                    errorType = ErrorType.Retry;
                    model.retry = yield Retrycf.setRetry(model.reference, model.rawValue(), Error(`${this.type}: ${this.message}`));
                    break;
                // fatal
                case StripeErrorType.RateLimitError:
                case StripeErrorType.StripeAuthenticationError:
                case StripeErrorType.UnexpectedError:
                    errorType = ErrorType.Internal;
                    model.result = yield new EventResponse.Result(model.reference).setInternalError(step, `${this.type}: ${this.message}`);
                    break;
                default:
                    errorType = ErrorType.Internal;
                    model.result = yield new EventResponse.Result(model.reference).setInternalError(step, `${this.type}: ${this.message}`);
                    break;
            }
            return errorType;
        });
    }
}
exports.StripeError = StripeError;
var Functions;
(function (Functions) {
    class OrderSKUObject {
        static fetchFrom(order, orderSKUType, skuType) {
            return __awaiter(this, void 0, void 0, function* () {
                const orderSKURefs = yield order.orderSKUs.get(orderSKUType);
                const orderSKUObjects = yield Promise.all(orderSKURefs.map(orderSKURef => {
                    return PringUtil.get(orderSKUType, orderSKURef.id).then(s => {
                        const orderSKU = s;
                        const orderSKUObject = new OrderSKUObject();
                        orderSKUObject.orderSKU = orderSKU;
                        return orderSKUObject;
                    });
                }));
                yield Promise.all(orderSKUObjects.map((orderSKUObject, index) => {
                    return orderSKUObject.orderSKU.sku.get().then(skuSnapshop => {
                        const s = new skuType();
                        s.init(skuSnapshop);
                        orderSKUObjects[index].sku = s;
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
        constructor(event, initializableClass) {
            this.event = event;
            this.orderID = event.params.orderID;
            this.initializableClass = initializableClass;
            this.order = new initializableClass.order();
            this.order.init(event.data);
            this.previousOrder = new initializableClass.order();
            this.previousOrder.init(event.data.previous);
        }
        getShops() {
            return __awaiter(this, void 0, void 0, function* () {
                this.shops = yield Promise.all(this.orderSKUObjects.map(orderSKUObject => {
                    return orderSKUObject.orderSKU.shop;
                }).filter((shopRef, index, self) => {
                    return self.indexOf(shopRef) === index;
                }).map(shopRef => {
                    return shopRef.get().then(shopSnapshot => {
                        const shop = new this.initializableClass.shop();
                        shop.init(shopSnapshot);
                        return shop;
                    });
                }));
            });
        }
        get isCharged() {
            if (this.order && this.order.stripe && this.order.stripe.chargeID) {
                return true;
            }
            return false;
        }
        get paymentAgencyType() {
            if (!this.order) {
                return PaymentAgencyType.Unknown;
            }
            if (this.order.stripe) {
                return PaymentAgencyType.Stripe;
            }
            return PaymentAgencyType.Unknown;
        }
        updateStock(operator, step) {
            const orderSKUObjects = this.orderSKUObjects;
            if (!orderSKUObjects) {
                throw Error('orderSKUObjects must be non-null');
            }
            return firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                const promises = [];
                for (const orderSKUObject of orderSKUObjects) {
                    const skuRef = firestore.collection(PringUtil.collectionPath(new this.initializableClass.sku())).doc(orderSKUObject.sku.id);
                    const t = transaction.get(skuRef).then(tsku => {
                        const quantity = orderSKUObject.orderSKU.quantity * operator;
                        const newStock = tsku.data().stock + quantity;
                        if (newStock >= 0) {
                            transaction.update(skuRef, { stock: newStock });
                        }
                        else {
                            // throw new Retrycf.ValidationError(ValidationErrorType.OutOfStock,
                            //   `${orderSKUObject.orderSKU.snapshotProduct!.name} が在庫不足です。\n注文数: ${orderSKUObject.orderSKU.quantity}, 在庫数${orderSKUObject.sku.stock}`)
                            throw new BadRequestError(ValidationErrorType.OutOfStock, `${orderSKUObject.orderSKU.snapshotProduct.name} が在庫不足です。\n注文数: ${orderSKUObject.orderSKU.quantity}, 在庫数${orderSKUObject.sku.stock}`);
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
    const preventStepName = 'preventMultipleProcessing';
    const preventMultipleProcessing = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (orderObject.isCharged) {
                return orderObject;
            }
            const completed = yield Mission.markCompleted(orderObject.order.reference, preventStepName);
            orderObject.order.completed = completed;
            return orderObject;
        }
        catch (error) {
            if (error.constructor === Mission.CompletedError) {
                throw new OrderableError(preventStepName, ErrorType.Completed, error);
            }
            // if not CompletedError, it maybe firebase internal error, because retry.
            orderObject.order.retry = yield Retrycf.setRetry(orderObject.order.reference, orderObject.order.rawValue(), error);
            throw new OrderableError(preventStepName, ErrorType.Retry, error);
        }
    }));
    const prepareRequiredData = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const user = yield PringUtil.get(orderObject.initializableClass.user, order.user.id);
            orderObject.user = user;
            const orderSKUObjects = yield OrderSKUObject.fetchFrom(order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku);
            orderObject.orderSKUObjects = orderSKUObjects;
            yield orderObject.getShops();
            if (orderObject.paymentAgencyType === PaymentAgencyType.Stripe) {
                const stripeCard = yield stripe.customers.retrieveCard(order.stripe.customerID, order.stripe.cardID);
                orderObject.stripeCard = stripeCard;
            }
            return orderObject;
        }
        catch (error) {
            // This error may be a data preparetion error. In that case, it will be solved by retrying.
            // orderObject.order = await NeoTask.setRetry(orderObject.order, 'prepareRequiredData', error)
            // TODO: Retry
            // throw new FlowError(error, orderObject.order.neoTask)
            // This error may be a data preparetion error. In that case, it will be solved by retrying.
            // console.log(error)
            orderObject.order.retry = yield Retrycf.setRetry(orderObject.order.reference, orderObject.order.rawValue(), error);
            throw new OrderableError(preventStepName, ErrorType.Retry, error);
        }
    }));
    const validateShopIsActive = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const shops = orderObject.shops;
            if (orderObject.isCharged) {
                return orderObject;
            }
            shops.forEach((shop, index) => {
                if (!shop.isActive) {
                    // throw new Retrycf.ValidationError(ValidationErrorType.ShopIsNotActive,
                    // `Shop: ${shop.name} is not active.`)
                    throw new BadRequestError(ValidationErrorType.ShopIsNotActive, `Shop: ${shop.name} is not active.`);
                }
            });
            return orderObject;
        }
        catch (error) {
            // if (error.constructor === Retrycf.ValidationError) {
            //   const validationError = error as Retrycf.ValidationError
            //   // orderObject.order = await NeoTask.setInvalid(orderObject.order, validationError)
            //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(ValidationErrorType.ShopIsNotActive, validationError.reason)
            //   throw new FlowError(error, orderObject.order.neoTask)
            // }
            if (error.constructor === BadRequestError) {
                const brError = error;
                orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message);
                throw new OrderableError('validateShopIsActive', ErrorType.BadRequest, error);
            }
            orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message);
            throw new OrderableError('validateShopIsActive', ErrorType.Internal, error);
        }
    }));
    const validateSKUIsActive = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const orderSKUObjects = orderObject.orderSKUObjects;
            if (orderObject.isCharged) {
                return orderObject;
            }
            orderSKUObjects.forEach((orderSKUObject, index) => {
                if (!orderSKUObject.sku.isActive) {
                    throw new BadRequestError(ValidationErrorType.SKUIsNotActive, 
                    // throw new Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive,
                    `Product: ${orderSKUObject.orderSKU.snapshotProduct.name}」 is not active.`);
                }
            });
            return orderObject;
        }
        catch (error) {
            // if (error.constructor === Retrycf.ValidationError) {
            //   const validationError = error as Retrycf.ValidationError
            //   // orderObject.order = await NeoTask.setInvalid(orderObject.order, validationError)
            //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(validationError.validationErrorType, validationError.reason)
            //   throw new FlowError(error, orderObject.order.neoTask)
            // }
            // throw (error)
            if (error.constructor === BadRequestError) {
                const brError = error;
                orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message);
                throw new OrderableError('validateSKUIsActive', ErrorType.BadRequest, error);
            }
            orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message);
            throw new OrderableError('validateSKUIsActive', ErrorType.Internal, error);
        }
    }));
    const validatePaymentMethod = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
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
                        throw new BadRequestError(ValidationErrorType.StripeCardExpired, 'This card is expired.');
                        // throw new Retrycf.ValidationError(ValidationErrorType.StripeCardExpired,
                    }
                    break;
                default:
                    // throw new Retrycf.ValidationError(ValidationErrorType.PaymentInfoNotFound,
                    throw new BadRequestError(ValidationErrorType.PaymentInfoNotFound, 'Payment information is not registered.');
            }
            return orderObject;
        }
        catch (error) {
            // if (error.constructor === Retrycf.ValidationError) {
            //   const validationError = error as Retrycf.ValidationError
            //   // orderObject.order = await NeoTask.setInvalid(orderObject.order, validationError)
            //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(validationError.validationErrorType, validationError.reason)
            //   throw new FlowError(error, orderObject.order.neoTask)
            // }
            // throw (error)
            if (error.constructor === BadRequestError) {
                const brError = error;
                orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message);
                throw new OrderableError('validatePaymentMethod', ErrorType.BadRequest, error);
            }
            orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message);
            throw new OrderableError('validatePaymentMethod', ErrorType.Internal, error);
        }
    }));
    const validateAndDecreaseStock = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (orderObject.isCharged) {
                return orderObject;
            }
            yield orderObject.updateStock(Operator.minus, 'validateAndDecreaseStock');
            // TODO: Delete the extra processing
            // orderObject.order = await PringUtil.get(orderObject.initializableClass.order, orderObject.orderID)
            return orderObject;
        }
        catch (error) {
            // clear completed mark for retry.
            orderObject.order.completed = yield Mission.remove(orderObject.order.reference, preventStepName);
            // if (error.constructor === Retrycf.ValidationError) {
            //   const validationError = error as Retrycf.ValidationError
            //   // orderObject.order = await NeoTask.setInvalid(orderObject.order, validationError)
            //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(validationError.validationErrorType, validationError.reason)
            //   throw new FlowError(error, orderObject.order.neoTask)
            // }
            if (error.constructor === BadRequestError) {
                const brError = error;
                orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message);
                throw new OrderableError('validateAndDecreaseStock', ErrorType.BadRequest, error);
            }
            orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message);
            throw new OrderableError('validateAndDecreaseStock', ErrorType.Internal, error);
            // throw (error)
        }
    }));
    const stripeCharge = (order) => __awaiter(this, void 0, void 0, function* () {
        return yield stripe.charges.create({
            amount: order.amount,
            currency: order.currency,
            customer: order.stripe.customerID,
            source: order.stripe.cardID,
            transfer_group: order.id,
            metadata: {
                orderID: order.id
            }
        }, {
            idempotency_key: order.id
        }).catch(e => {
            throw new StripeError(e);
        });
    });
    const payment = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
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
            orderObject.order.completed = yield Mission.remove(orderObject.order.reference, preventStepName);
            // // Restored stock count, so clean up `completed` for retry.
            // orderObject.order.completed = await Mission.remove(orderObject.order.reference, preventStepName)
            if (error.constructor === StripeError) {
                const stripeError = error;
                // orderObject.order = await stripeError.setNeoTask(orderObject.order, 'payment')
                // TODO: striperror handling
                const errorType = yield stripeError.setError(orderObject.order, 'payment');
                throw new OrderableError('payment', errorType, error);
            }
            orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message);
            throw new OrderableError('payment', ErrorType.Internal, error);
        }
    }));
    /**
     * Save peyment succeeded information.
     * Set fatal error if this step failed.
     */
    const updateOrder = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            if (orderObject.isCharged) {
                return orderObject;
            }
            switch (orderObject.paymentAgencyType) {
                case PaymentAgencyType.Stripe:
                    const charge = orderObject.stripeCharge;
                    order.paymentStatus = OrderPaymentStatus.Paid;
                    order.stripe.chargeID = charge.id;
                    order.paidDate = FirebaseFirestore.FieldValue.serverTimestamp();
                    // FIXME: Error: Cannot encode type ([object Object]) to a Firestore Value
                    // await order.update()
                    yield order.reference.update({
                        paymentStatus: OrderPaymentStatus.Paid,
                        stripe: orderObject.order.rawValue().stripe,
                        paidDate: FirebaseFirestore.FieldValue.serverTimestamp(),
                        updatedAt: FirebaseFirestore.FieldValue.serverTimestamp()
                    });
                    break;
                default:
            }
            console.log('charge completed');
            return orderObject;
        }
        catch (error) {
            // If this step failed, we can not remember chargeID. Because set fatal error.
            // orderObject.order = await NeoTask.setFatalAndPostToSlack(orderObject.order, 'updateOrder', error)
            // orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest('updateOrder', error)
            // throw new FlowError(error, orderObject.order.neoTask)
            orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message);
            throw new OrderableError('updateOrder', ErrorType.Internal, error);
        }
    }));
    const updateOrderShops = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const orderShopColRef = PringUtil.collectionPath(new orderObject.initializableClass.orderShop());
            const orderColRef = PringUtil.collectionPath(new orderObject.initializableClass.order());
            yield firestore.collection(orderShopColRef)
                .where('order', '==', firestore.collection(orderColRef).doc(orderObject.orderID))
                .get()
                .then(snapshot => {
                const batch = firestore.batch();
                // Only when paymentStatus is OrderShopPaymentStatus.Created, updates to OrderShopPaymentStatus.Paid.
                snapshot.docs.filter(doc => {
                    const orderShop = new orderObject.initializableClass.orderShop();
                    orderShop.init(doc);
                    return orderShop.paymentStatus === OrderShopPaymentStatus.Created;
                }).forEach(doc => {
                    batch.update(doc.ref, {
                        paymentStatus: OrderShopPaymentStatus.Paid,
                        updatedAt: FirebaseFirestore.FieldValue.serverTimestamp()
                    });
                });
                return batch.commit();
            });
            return orderObject;
        }
        catch (error) {
            // orderObject.order = await NeoTask.setRetry(orderObject.order, 'updateOrderShops', error)
            // TODO: set retry
            // throw new FlowError(error, orderObject.order)
            // This step fails only when a batch error occurs. Because set retry.
            orderObject.order.retry = yield Retrycf.setRetry(orderObject.order.reference, orderObject.order.rawValue(), error);
            throw new OrderableError('updateOrderShops', ErrorType.Retry, error);
        }
    }));
    const setOrderTask = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            // orderObject.order = await NeoTask.setSuccess(orderObject.order)
            orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setOK();
            return orderObject;
        }
        catch (error) {
            // This step fails only when update error occurs. Because set retry.
            // orderObject.order = await NeoTask.setRetry(orderObject.order, 'setOrderTask', error)
            // TODO: Retry
            // throw new FlowError(error, orderObject.order)
            orderObject.order.retry = yield Retrycf.setRetry(orderObject.order.reference, orderObject.order.rawValue(), error);
            throw new OrderableError('setOrderTask', ErrorType.Retry, error);
        }
    }));
    /**
     * Start order processing.
     * @param orderObject
     */
    Functions.orderPaymentRequested = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const shouldRetry = false;
            // TODO: Retry
            // const shouldRetry = NeoTask.shouldRetry(orderObject.order, orderObject.previousOrder)
            // orderObject.order = await NeoTask.setFatalAndPostToSlackIfRetryCountIsMax(orderObject.order, orderObject.previousOrder)
            // If order.paymentStatus update to PaymentRequested or should retry is true, continue processing.
            if (orderObject.previousOrder.paymentStatus !== orderObject.order.paymentStatus && orderObject.order.paymentStatus === OrderPaymentStatus.PaymentRequested) {
                // continue
            }
            else {
                if (!shouldRetry) {
                    return undefined; // not continue
                }
            }
            const flow = new Flow.Line([
                prepareRequiredData,
                validateShopIsActive,
                validateSKUIsActive,
                validatePaymentMethod,
                preventMultipleProcessing,
                validateAndDecreaseStock,
                payment,
                updateOrder,
                updateOrderShops,
                setOrderTask
            ]);
            yield flow.run(orderObject);
            return Promise.resolve();
        }
        catch (error) {
            if (error.constructor !== OrderableError) {
                orderObject.order.result = yield new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message);
                throw new OrderableError('orderPaymentRequested', ErrorType.Internal, error);
            }
            return Promise.reject(error);
        }
    });
})(Functions = exports.Functions || (exports.Functions = {}));
