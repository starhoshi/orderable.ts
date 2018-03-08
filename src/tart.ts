import * as FirebaseFirestore from '@google-cloud/firestore'

export class Snapshot<T extends Pring> {
  ref: FirebaseFirestore.DocumentReference
  data: T

  constructor(snapshot: FirebaseFirestore.DocumentSnapshot) {
    this.ref = snapshot.ref
    this.data = snapshot.data()!.data as T
  }
}

export interface Pring {
  createdAt: Date
  updatedAt: Date
}
