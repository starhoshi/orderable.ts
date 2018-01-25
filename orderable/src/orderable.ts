import { Retrycf } from 'retrycf'
import { Pring, property } from 'pring'

export class HasNeoTask extends Pring.Base {
  @property neoTask?: HasNeoTask
}

export namespace Model {
  export class Order extends Pring.Base {
    @property neoTask?: HasNeoTask
  }
}
