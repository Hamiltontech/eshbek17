/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useService } from "@web/core/utils/hooks";
import { CreateTransferOrderPopupWidget } from "@hst_ishbik_intgration/js/CreateTransferOrderPopupWidget";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export class TransferOrderButton extends Component {
    static template = "hst_ishbik_intgration.TransferOrderButton";

    setup() {
        this.pos = usePos();
        this.popup = useService("popup");
    }
    async onClick() {
        var self = this;
        let order = this.pos.get_order();
        let orderlines = order.get_orderlines();
        await self.pos.popup.add(CreateTransferOrderPopupWidget)
    }
}

ProductScreen.addControlButton({
    component: TransferOrderButton,
    condition: function() {
        return this.pos.config.is_call_center;
    },
});
