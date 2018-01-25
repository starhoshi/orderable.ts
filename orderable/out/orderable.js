"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const pring_1 = require("pring");
// export class HasNeoTask extends Pring.Base {
//   @property neoTask?: HasNeoTask
// }
var Model;
(function (Model) {
    class HasNeoTask extends pring_1.Pring.Base {
    }
    __decorate([
        pring_1.property
    ], HasNeoTask.prototype, "neoTask", void 0);
    Model.HasNeoTask = HasNeoTask;
    class User extends pring_1.Pring.Base {
    }
    __decorate([
        pring_1.property
    ], User.prototype, "stripeCustomerID", void 0);
    Model.User = User;
    class Shop extends pring_1.Pring.Base {
        constructor() {
            super(...arguments);
            this.isActive = true;
            this.freePostageMinimunPrice = -1;
        }
    }
    __decorate([
        pring_1.property
    ], Shop.prototype, "name", void 0);
    __decorate([
        pring_1.property
    ], Shop.prototype, "isActive", void 0);
    __decorate([
        pring_1.property
    ], Shop.prototype, "freePostageMinimunPrice", void 0);
    Model.Shop = Shop;
    class Product extends pring_1.Pring.Base {
    }
    __decorate([
        pring_1.property
    ], Product.prototype, "name", void 0);
    Model.Product = Product;
    let StockType;
    (function (StockType) {
        StockType["Unknown"] = "unknown";
        StockType["Finite"] = "finite";
        StockType["Infinite"] = "infinite";
    })(StockType = Model.StockType || (Model.StockType = {}));
    class SKU extends pring_1.Pring.Base {
        constructor() {
            super(...arguments);
            this.price = 0;
            this.stockType = StockType.Unknown;
            this.stock = 0;
            this.isPublished = true;
            this.isActive = true;
        }
        // 在庫チェック
        isInStock(quantity) {
            return this.stock - quantity >= 0;
        }
    }
    __decorate([
        pring_1.property
    ], SKU.prototype, "price", void 0);
    __decorate([
        pring_1.property
    ], SKU.prototype, "stockType", void 0);
    __decorate([
        pring_1.property
    ], SKU.prototype, "stock", void 0);
    __decorate([
        pring_1.property
    ], SKU.prototype, "isPublished", void 0);
    __decorate([
        pring_1.property
    ], SKU.prototype, "isActive", void 0);
    Model.SKU = SKU;
    let OrderStatus;
    (function (OrderStatus) {
        OrderStatus[OrderStatus["Unknown"] = 0] = "Unknown";
        OrderStatus[OrderStatus["Created"] = 1] = "Created";
        OrderStatus[OrderStatus["PaymentRequested"] = 2] = "PaymentRequested";
        OrderStatus[OrderStatus["WaitingForPayment"] = 3] = "WaitingForPayment";
        OrderStatus[OrderStatus["Paid"] = 4] = "Paid";
    })(OrderStatus = Model.OrderStatus || (Model.OrderStatus = {}));
    class Order extends HasNeoTask {
        constructor() {
            super(...arguments);
            this.amount = 0;
            this.skuPriceSum = 0;
            this.postage = 0;
            this.expirationDate = new Date().setHours(new Date().getHours() + 1);
            this.status = OrderStatus.Created;
            // @property orderShops: Pring.ReferenceCollection<OrderShop> = new Pring.ReferenceCollection(this)
            this.orderSKUs = new pring_1.Pring.ReferenceCollection(this);
        }
    }
    __decorate([
        pring_1.property
    ], Order.prototype, "user", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "stripeCardID", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "amount", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "skuPriceSum", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "postage", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "paidDate", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "expirationDate", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "status", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "stripeChargeID", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "currency", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "orderSKUs", void 0);
    Model.Order = Order;
    let OrderShopStatus;
    (function (OrderShopStatus) {
        OrderShopStatus[OrderShopStatus["Unknown"] = 0] = "Unknown";
        OrderShopStatus[OrderShopStatus["Created"] = 1] = "Created";
        OrderShopStatus[OrderShopStatus["Paid"] = 2] = "Paid";
        OrderShopStatus[OrderShopStatus["Delivered"] = 3] = "Delivered";
        OrderShopStatus[OrderShopStatus["Recieved"] = 4] = "Recieved";
    })(OrderShopStatus = Model.OrderShopStatus || (Model.OrderShopStatus = {}));
    class OrderShop extends pring_1.Pring.Base {
        constructor() {
            super(...arguments);
            this.orderSKUs = new pring_1.Pring.ReferenceCollection(this);
            this.status = OrderShopStatus.Unknown;
        }
    }
    __decorate([
        pring_1.property
    ], OrderShop.prototype, "orderSKUs", void 0);
    __decorate([
        pring_1.property
    ], OrderShop.prototype, "status", void 0);
    __decorate([
        pring_1.property
    ], OrderShop.prototype, "order", void 0);
    __decorate([
        pring_1.property
    ], OrderShop.prototype, "user", void 0);
    Model.OrderShop = OrderShop;
    class OrderSKU extends pring_1.Pring.Base {
        constructor() {
            super(...arguments);
            this.quantity = 0;
            // @property order: FirebaseFirestore.DocumentReference
            // @property user: FirebaseFirestore.DocumentReference
            // @property sku: FirebaseFirestore.DocumentReference
            // @property product: FirebaseFirestore.DocumentReference
            // @property shop: FirebaseFirestore.DocumentReference
        }
    }
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "orderShop", void 0);
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "snapshotSKU", void 0);
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "snapshotProduct", void 0);
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "quantity", void 0);
    Model.OrderSKU = OrderSKU;
})(Model = exports.Model || (exports.Model = {}));
