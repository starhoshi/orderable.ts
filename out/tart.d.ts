import * as FirebaseFirestore from '@google-cloud/firestore';
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
export declare class Snapshot<T extends Pring> {
    ref: FirebaseFirestore.DocumentReference;
    data: T;
    constructor(snapshot: FirebaseFirestore.DocumentSnapshot | DeltaDocumentSnapshot);
}
export interface Pring {
    createdAt: Date;
    updatedAt: Date;
}
export interface ReferenceCollection {
    createdAt: Date;
    updatedAt: Date;
}
export declare const data: <T extends Pring>(path: string, id: string) => Promise<Snapshot<T>>;
