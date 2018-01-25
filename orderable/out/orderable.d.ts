import { Pring } from 'pring';
export declare namespace Model {
    class HasNeoTask extends Pring.Base {
        neoTask?: HasNeoTask;
    }
    class User extends Pring.Base {
        stripeCustomerID?: string;
    }
    class Shop extends Pring.Base {
        name?: string;
        isActive: boolean;
        freePostageMinimunPrice: number;
    }
    class Product extends Pring.Base {
        name?: string;
    }
    enum StockType {
        Unknown = "unknown",
        Finite = "finite",
        Infinite = "infinite",
    }
    class SKU extends Pring.Base {
        price: number;
        stockType: StockType;
        stock: number;
        isPublished: boolean;
        isActive: boolean;
        isInStock(quantity: number): boolean;
    }
    enum OrderStatus {
        Unknown = 0,
        Created = 1,
        PaymentRequested = 2,
        WaitingForPayment = 3,
        Paid = 4,
    }
    class Order extends HasNeoTask {
        user: FirebaseFirestore.DocumentReference;
        stripeCardID?: string;
        amount: number;
        skuPriceSum: number;
        postage: number;
        paidDate: FirebaseFirestore.FieldValue;
        expirationDate: FirebaseFirestore.FieldValue;
        status: OrderStatus;
        stripeChargeID?: string;
        currency?: string;
        orderSKUs: Pring.ReferenceCollection<OrderSKU>;
    }
    enum OrderShopStatus {
        Unknown = 0,
        Created = 1,
        Paid = 2,
        Delivered = 3,
        Recieved = 4,
    }
    class OrderShop extends Pring.Base {
        orderSKUs: Pring.ReferenceCollection<OrderSKU>;
        status: OrderShopStatus;
        order: FirebaseFirestore.DocumentReference;
        user: FirebaseFirestore.DocumentReference;
    }
    class OrderSKU extends Pring.Base {
        orderShop: FirebaseFirestore.DocumentReference;
        snapshotSKU: SKU;
        snapshotProduct: Product;
        quantity: number;
    }
}
