"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
class PringUtil {
    static collectionPath(model) {
        return `version/${model.getVersion()}/${model.getModelName()}`;
    }
    static get(klass, id) {
        const model = new klass();
        return index_1.firestore.collection(PringUtil.collectionPath(model)).doc(id).get().then(s => {
            model.init(s);
            return model;
        });
    }
}
exports.PringUtil = PringUtil;
