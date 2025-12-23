/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { onMounted } from "@odoo/owl";

patch(ProductScreen.prototype, {
    setup() {
        super.setup();

        const bus_service = this.env.services.bus_service;
        const notification = this.env.services.notification;

        // Subscribe POS to custom notification channel
        const channel = JSON.stringify(["pos.custom.notification"]);
        bus_service.addChannel(channel);

        onMounted(() => {
            bus_service.addEventListener("notification", ({ detail }) => {
                for (const { type, payload } of detail) {
                    if (type === "custom_alert" && payload?.message) {
                        notification.add(payload.message, {
                            title: payload.title || "POS Notice",
                            type: payload.level || "info",
                        });
                    }
                }
            });
        });
    },
});


