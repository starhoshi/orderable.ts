declare module "model" {
    export class Hoge {
    }
}
declare module "orderable" {
    import { Pring } from 'pring';
    export class HasNeoTask extends Pring.Base {
        neoTask?: HasNeoTask;
    }
}
declare module "__tests__/orderable.test" {
    import 'jest';
}
