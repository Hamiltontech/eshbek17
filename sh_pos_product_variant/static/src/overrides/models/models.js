/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

patch(PosStore.prototype, {
    async _processData(loadedData) {
        this.db.alternative_product_by_id = {}
        super._processData(...arguments)
        this.db.sh_attribute_by_id = loadedData['sh_attribute_by_id'] || []
        this.db.sh_attribute_value_by_id = loadedData['sh_attribute_value_by_id'] || [] 
    }
});
