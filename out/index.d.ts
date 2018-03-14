/// <reference types="stripe" />
import * as FirebaseFirestore from '@google-cloud/firestore';
import * as Stripe from 'stripe';
export * from './error';
export * from './protocol';
export * from './function';
export declare let stripe: Stripe;
export declare let firestore: FirebaseFirestore.Firestore;
export declare const initialize: (options: {
    adminOptions: any;
    stripeToken: string;
}) => void;
