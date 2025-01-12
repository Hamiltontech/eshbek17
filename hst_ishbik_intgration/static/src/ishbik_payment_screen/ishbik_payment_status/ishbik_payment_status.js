/** @odoo-module */

import { Component } from "@odoo/owl";

export class IshbikPaymentScreenStatus extends Component {
    static template = "hst_ishbik_intgration.PaymentScreenStatus";

    get changeText() {
        return this.env.utils.formatCurrency(this.props.order.get_change());
    }
    get totalDueText() {
        return this.env.utils.formatCurrency(
            this.props.order.get_total_with_tax() + this.props.order.get_rounding_applied()
        );
    }
    get remainingText() {
        return this.env.utils.formatCurrency(
            this.props.order.get_due() > 0 ? this.props.order.get_due() : 0
        );
    }
}
