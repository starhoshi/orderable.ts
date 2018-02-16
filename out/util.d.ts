import { Pring } from 'pring';
export declare class PringUtil {
    static collectionPath<T extends Pring.Base>(model: T): string;
    static get<T extends Pring.Base>(klass: {
        new (): T;
    }, id: string): Promise<T>;
}
