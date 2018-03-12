import * as FirebaseFirestore from '@google-cloud/firestore'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { firestore } from './index'

export class Snapshot<T extends Pring> {
  ref: FirebaseFirestore.DocumentReference
  data: T

  constructor(ref: FirebaseFirestore.DocumentReference, data: T)
  constructor(snapshot: FirebaseFirestore.DocumentSnapshot | DeltaDocumentSnapshot)
  constructor(a: any, b?: any) {
    if (b === null || b === undefined) {
      this.ref = a.ref
      this.data = a.data() as T
    } else {
      this.ref = a
      this.data = b
    }
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

  setReferenceCollectionWithBatch(collection: string, ref: FirebaseFirestore.DocumentReference, batch: FirebaseFirestore.WriteBatch) {
    const rc = this.ref.collection(collection).doc(ref.id)
    batch.create(rc, { createdAt: new Date(), updatedAt: new Date() })
    return batch
  }

  update(data: { [id: string]: any }) {
    data.updatedAt = Date()
    Object.keys(data).forEach(key => {
      this.data[key] = data[key]
    })
    return this.ref.update(data)
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
  const ds = await firestore.collection(path).doc(id).get()
  return new Snapshot<T>(ds)
}
