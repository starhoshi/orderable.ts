import * as FirebaseFirestore from '@google-cloud/firestore'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { firestore } from './index'

export class Snapshot<T extends Pring> {
  ref: FirebaseFirestore.DocumentReference
  data: T

  constructor(ref: FirebaseFirestore.DocumentReference, data: T)
  constructor(snapshot: FirebaseFirestore.DocumentSnapshot | DeltaDocumentSnapshot)
  constructor(a: any, b?: any) {
    if (b === null) {
      this.ref = a.ref
      this.data = a.data()!.data as T
    }

    this.ref = a
    this.data = b
  }

  static makeNotSavedSnapshot<T extends Pring>(path: string, data: T) {
    const ref = firestore.collection(path).doc()
    return new Snapshot<T>(ref, data)
  }

  setCreatedDate() {
    this.data.createdAt = new Date()
    this.data.updatedAt = new Date()
  }

  save() {
    this.setCreatedDate()
    return this.ref.create(this.data)
  }

  saveWithBatch(batch: FirebaseFirestore.WriteBatch) {
    this.setCreatedDate()
    batch.create(this.ref, this.data)
    return batch
  }
}

export interface Pring {
  createdAt?: Date
  updatedAt?: Date
}

export interface ReferenceCollection {
  createdAt?: Date
  updatedAt?: Date
}

export const fetch = async <T extends Pring>(path: string, id: string) => {
  const ds = await firestore.doc(`${path}/${id}`).get()
  return new Snapshot<T>(ds)
}
