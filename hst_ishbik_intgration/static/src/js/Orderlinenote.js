/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { OrderlineNotePopupWidget } from "@hst_ishbik_intgration/js/OrderlineNotePopupWidget";

export class OrderlineNote extends Component {
    static template = "hst_ishbik_intgration.OrderlineNote";

    setup() {
        this.pos = usePos();
        this.popup = useService("popup");
    }
    get selectedOrderline() {
        return this.env.services.pos.get_order().get_selected_orderline();
    }
    async onClick() {
        var self =this;
        if (!this.selectedOrderline) return;
        const { confirmed, payload: inputNote } = await self.pos.popup.add(OrderlineNotePopupWidget,{
            lineValue: this.selectedOrderline.get_line_note(),
            title: _t("Add Note in Orderline'"),
            order_line_note: this.env.services.pos.order_line_note,
        })

        if (confirmed) {
            this.selectedOrderline.set_line_note(inputNote);
        }
    }
}

ProductScreen.addControlButton({
    component: OrderlineNote,
    condition: function() {
        return this.pos.config.is_call_center;
    },
});

