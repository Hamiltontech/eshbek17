/** @odoo-module */
import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { onMounted, useRef, useState } from "@odoo/owl";

export class OrderlineNotePopupWidget extends AbstractAwaitablePopup {
    static template = "hst_ishbik_intgration.OrderlineNotePopupWidget";
    static defaultProps = {};

    setup() {
        super.setup();
        this.state = useState({ inputValue: this.props.lineValue });
        this.inputRef = useRef("input");
        onMounted(() => this.inputRef.el.focus());
    }
    getPayload() {
        return this.state.inputValue;
    }
    line_button(event){
        const value = event.target.innerHTML;
        this.state.inputValue += (" "+value)  
    }
   
}



