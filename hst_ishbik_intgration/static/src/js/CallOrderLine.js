/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { CancelReasonPopup } from "@hst_ishbik_intgration/js/cancel_reason_popup";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { useService } from "@web/core/utils/hooks";
import { useAsyncLockedMethod } from "@point_of_sale/app/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component} from "@odoo/owl";

export class CallOrderLine extends Component {
    static template = "hst_ishbik_intgration.CallOrderLine";

    setup() {
        super.setup();
    }
    async order_cancel(order_id){
        const { confirmed, payload } = await this.env.services.pos.popup.add(NumberPopup, {
            title: _t('Authorization Code'),
            isPassword: true,
            isInputSelected: true,
        });
        var user = this.env.services.pos.user
        if (payload == user.user_pin){
            await this.env.services.pos.popup.add(CancelReasonPopup, {
                order_id:order_id,
            });

        }else{
            await this.env.services.pos.popup.add(ErrorPopup, {
                title: _t("Incorrect Password."),
                body: _t("Please enter valid Password"),
            });
        }

    }
}

registry.category("pos_screens").add("CallOrderLine", CallOrderLine);
