/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useAsyncLockedMethod } from "@point_of_sale/app/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component} from "@odoo/owl";

export class ReceiveOrderLine extends Component {
    static template = "hst_ishbik_intgration.ReceiveOrderLine";

    setup() {
        super.setup();
    }
    GetFormattedDate(date) {
        var month = ("0" + (date.getMonth() + 1)).slice(-2);
        var day  = ("0" + (date.getDate())).slice(-2);
        var year = date.getFullYear();
        var hour =  ("0" + (date.getHours())).slice(-2);
        var min =  ("0" + (date.getMinutes())).slice(-2);
        var seg = ("0" + (date.getSeconds())).slice(-2);
        return year + "-" + month + "-" + day + " " + hour + ":" +  min + ":" + seg;
    }

    get_order_date(dt){
        let a=dt.split("T");   
        let a1=a[0]+'T';
        let a2=a[1]+'Z';
        let final_date=a1+a2;
        let date = new Date(final_date);
        let new_date = this.GetFormattedDate(date);
        return new_date
    }
    async clickReprint(event){
        let self = this;
        let order = event;
        self.env.services.orm.call(
            "pos.call.order",
            "print_pos_receipt",
            [order.id],
        ).then(function(output){
            let data = output;
            data['order'] = order;
            self.env.services.pos.showTempScreen("ReceiveOrderPrint",data)
        });

    }
}

registry.category("pos_screens").add("ReceiveOrderLine", ReceiveOrderLine);
