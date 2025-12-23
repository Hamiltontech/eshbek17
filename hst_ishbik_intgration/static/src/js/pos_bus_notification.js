/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { onMounted } from "@odoo/owl";

patch(ProductScreen.prototype, {
    setup() {
        super.setup();

        const bus_service = this.env.services.bus_service;
        const notification = this.env.services.notification;

        console.log("[Ishbic POS Bus] ProductScreen.setup: initializing bus subscription");

        // Subscribe POS to custom notification channel (string channel, db is handled server-side)
        const channel = "pos.custom.notification";
        console.log("[Ishbic POS Bus] Subscribing to channel:", channel);
        bus_service.addChannel(channel);

        onMounted(() => {
            console.log("[Ishbic POS Bus] onMounted: subscribing to custom_alert notifications");
            bus_service.subscribe("custom_alert", (payload) => {
                console.log("[Ishbic POS Bus] Received custom_alert payload:", payload);
                if (payload?.message) {
                    notification.add(payload.message, {
                        title: payload.title || "POS Notice",
                        type: payload.level || "info",
                    });
                } else {
                    console.log(
                        "[Ishbic POS Bus] Received custom_alert without message field:",
                        payload
                    );
                }
            });
        });
    },
});


