export type YandexEdaTrackingOrders = {
    payload: {
        trackedOrders: Array<{
            status:
                | 'order.created'
                | 'order.cooking'
                | 'order.delivering'
                | 'courier.arrived_to_customer'
                | 'order.delivered'
                | 'order.cancel';
            title: string;
            description: string;
            eta: number | null;
            deliveryDate: string | null;
            checkAfter: number;
            order: {
                orderNr: string;
                status: {
                    id: number;
                    date: string;
                };
                location: {
                    latitude: number;
                    longitude: number;
                };
                isAsap: boolean;
                deliveryTime: string;
                deliveryType: string;
            } & {
                shippingType: 'delivery' | 'pickup';
            };
            place: {
                name: string;
                location: {
                    latitude: number;
                    longitude: number;
                };
            } & {
                address: string;
                locationLink: string;
                comment: string | null;
            };
            courier: {
                name: string;
                location: {
                    latitude: number;
                    longitude: number;
                };
                isHardOfHearing: boolean;
                options: Array<{
                    code: 'yandex_rover'
                }>;
            };
            contact: {
                type: string;
                phone: string | null;
            };
            contacts: Array<{
                type: string;
                phone: string;
                title: string;
            }>;
            time: number;
            createdAt: string;
            payment: {
                status:
                    | 'payment.processing'
                    | 'payment.success'
                    | 'payment.failed';
                errorMessage: string | null;
            };
            service: 'grocery' | 'eats' | 'pharmacy' | 'shop';
            clientApp: 'native' | 'taxi-app';
            actions: Array<{
                type?:
                    | 'contact_us'
                    | 'cancel_order'
                    | 'call'
                    | 'close'
                    | 'order_has_arrived_yes'
                    | 'order_has_arrived_no'
                    | 'go_to_catalog'
                    | 'need_help'
                    | 'show_order_changes'
                    | 'open_rover';
                title?: string;
                payload?: {
                    phone?: string;
                    timerSecondsLeft?: number;
                    timerEndDate?: string;
                } | null;
                actions?: Array<{}> | null;
            }>;
            statuses: Array<{
                status?: 'pending' | 'in_progress' | 'finished' | 'failed';
                uri?: string;
                payload?: {
                    eta?: {
                        count?: string;
                        units?: string;
                    };
                    has_animation?: boolean;
                } | null;
            }>;
            car?: {
                car_number?: string | null;
                car_plate?: Array<{
                    type?: 'number' | 'letter' | 'region';
                    value?: string;
                }> | null;
                description_template?: string | null;
            };
        }>;
    };
    meta: {
        count: number;
        checkAfter?: number;
    };
};