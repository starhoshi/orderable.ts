import { Retrycf } from 'retrycf'
import { Pring, property } from 'pring'
import * as Model from './model'

export class HasNeoTask extends Pring.Base {
  @property neoTask?: HasNeoTask
}
