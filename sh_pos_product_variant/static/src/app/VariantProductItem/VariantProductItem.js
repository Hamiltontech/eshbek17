/** @odoo-module */

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export class VariantProductItem extends Component {
    static template = "sh_pos_product_variant.VariantProductItem";

    setup() {
        this.pos = usePos();
    }
}
