/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { Component, onMounted, useRef } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class NotificationPopup extends AbstractAwaitablePopup {
    static template = "hst_ishbik_intgration.NotificationPopup";
    static defaultProps = {
        sound: true,
    };

    setup() {
        super.setup();
        onMounted(this.onMounted);
        this.sound = useService("sound");
    }

    onMounted() {
        if (this.sound) {
            this.sound.play("bell");
        }
    }

}
