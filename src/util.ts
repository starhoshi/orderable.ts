import { Pring } from 'pring'
import { firestore } from './index'

export class PringUtil {
  static collectionPath<T extends Pring.Base>(model: T): string {
    return `version/${model.getVersion()}/${model.getModelName()}`
  }

  static async get<T extends Pring.Base>(klass: { new(): T }, id: string) {
    const model = new klass()
    return firestore.collection(PringUtil.collectionPath(model)).doc(id).get().then(s => {
      model.init(s)
      return model
    })
  }
}
