/** @odoo-module */
import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { onMounted } from "@odoo/owl";

export class CancelReasonPopup extends AbstractAwaitablePopup {
    static template = "hst_ishbik_intgration.CancelReasonPopup";
    static defaultProps = {
        confirmText: _t("Ok"),
        cancelText: _t("Cancel"),
        title: _t("Add Cancel Reason"),
        body: "",
    };

    setup() {
        super.setup();
    }
    async confirm() {
        var self= this;
        var current_order = this.env.services.pos.get_order();
        var reason_text = document.getElementById("cancel_reason_val").value;
        if (reason_text){ 
            await self.env.services.orm.call(
                "pos.call.order",
                "cancel_order",
                [,self.props.order_id,reason_text],
            )
            this.cancel();
            self.env.services.pos.closeTempScreen();
            self.env.services.pos.showScreen("ProductScreen");
        }else{
            this.cancel();
        }

    }
    
}


