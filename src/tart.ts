import * as FirebaseFirestore from '@google-cloud/firestore'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { firestore } from './index'

export class Snapshot<T extends Pring> {
  ref: FirebaseFirestore.DocumentReference
  data: T

  constructor(snapshot: FirebaseFirestore.DocumentSnapshot | DeltaDocumentSnapshot) {
    this.ref = snapshot.ref
    this.data = snapshot.data()!.data as T
  }
}

export interface Pring {
  createdAt: Date
  updatedAt: Date
}

export interface ReferenceCollection {
  createdAt: Date
  updatedAt: Date
}

export const data = async <T extends Pring>(path: string, id: string) => {
  const ds = await firestore.doc(`${path}/${id}`).get()
  return new Snapshot<T>(ds)
}
