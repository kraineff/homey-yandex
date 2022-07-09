export type Order = {
    id: string,
    order_nr: string,
    cart: {
        place_slug: string,
        items: {
            id: number,
            item_id: number,
            name: string,
            price: number,
            price_rational: string,
            quantity: number,
            quantity_rational: number,
            description: string,
            weight: string | null,
            item_options: any[],
            place_menu_item: any,
            promo_type: any
        }[],
        delivery_date_time: string | null,
        subtotal: number,
        subtotal_rational: string,
        discount: number,
        discount_rational: string,
        delivery_fee: number,
        delivery_fee_rational: string,
        total: number,
        total_rational: string
        delivery_time: string | null,
        requirements: {
            sum_to_free_delivery: number,
            sum_to_min_order: number | null,
            next_delivery_threshold: string
        },
        place: {
            name: string,
            slug: string,
            market: boolean,
            available_payment_methods: number[],
            is_store: boolean
        },
        updated_at: string,
        available_time_picker: any[],
        promos: any[],
        promocode: string | null,
        promo_items: any[],
        promo_notification: any,
        discount_promo: number,
        discount_promo_rational: string,
        surge: string | null,
        country: string | null
    },
    place: {
        id: number,
        name: string,
        slug: string,
        description: string | null,
        market: boolean,
        categories: {
            id: number,
            name: string,
            picture: string | null
        }[],
        picture: string,
        price_category: {
            id: number,
            name: string,
            value: number
        },
        rating: number,
        delivery_cost_thresholds: {
            delivery_cost: number,
            order_price: number
        }[],
        delivery_conditions: string,
        minimal_order_price: number,
        is_new: boolean,
        business_hours: {
            weekday: number,
            opening_hours: string,
            closing_hours: string
        }[],
        business_hours_sliced: {
            weekday: number,
            opening_hours: string,
            closing_hours: string
        }[],
        address: {
            city: string,
            street: string | null,
            house: string | null,
            plot: string | null,
            building: string | null,
            entrance: string | null,
            floor: string | null,
            office: string | null,
            doorcode: string | null,
            location: {
                latitude: number,
                longitude: number
            },
            comment: string | null,
            full: string,
            short: string
        },
        items: any[],
        zone: {
            points: any[],
            is_hole: boolean
        },
        resized_picture: string,
        enabled: boolean,
        is_promo_available: boolean,
        footer_description: string
    },
    comment: string | null,
    created_at: string,
    /**
     * (4) Доставлено
     * (9) Курьер забрал заказ
     */
    status: {
        id: number,
        title: string,
        date: string
    },
    payment_status: {
        id: number,
        title: string,
        type: number
    },
    address: {
        city: string,
        street: string | null,
        house: string | null,
        plot: string | null,
        building: string | null,
        entrance: string | null,
        floor: string | null,
        office: string | null,
        doorcode: string | null,
        location: {
            latitude: number,
            longitude: number
        },
        comment: string | null,
        full: string,
        short: string
    },
    awaiting_payment: boolean,
    phone_number: string,
    without_callback: boolean,
    has_feedback: boolean,
    feedback_status: string,
    cancelable: boolean,
    service: string,
    client_app: string,
    currency: {
        code: string,
        sign: string
    },
    shipping_type: string,
    persons_quantity: number,
    courier: {
        name: string,
        options: any[]
    },
    can_contact_us: boolean
}

export type OrdersInfoOrderResponse = {
    order_nr: string,
    created_at: string,
    payment_details: {
        title: string,
        payload: any[]
    },
    original_cost_for_customer: string,
    final_cost_for_customer: string,
    original_total_cost_for_customer: string,
    total_cost_for_customer: string,
    currency_rules: {
        code: string,
        sign: string,
        template: string,
        text: string
    },
    status_for_customer: "in_delivery" | "delivered" | string,
    place: {
        slug: string,
        name: string,
        business: string,
        is_marketplace: boolean,
        address: {
            city: string,
            short: string
        },
        brand: {
            slug: string,
            name: string
        }
    },
    delivery_address: string,
    delivery_point: {
        latitude: number,
        longitude: number
    },
    forwarded_courier_phone: string,
    original_items: {
        id: string,
        name: string,
        cost_for_customer: string,
        count: number,
        images: {
            url: string,
            resized_url_pattern: string
        }[]
    }[],
    diff: {
        no_changes: {
            id: string,
            name: string,
            cost_for_customer: string,
            count: number,
            images: {
                url: string,
                resized_url_pattern: string
            }[]
        }[],
        add: any[],
        remove: any[],
        replace: any[],
        update: any[]
    },
    show_feedback_button: boolean,
    has_feedback: boolean,
    receipts: {
        type: string,
        receipt_url: string,
        created_at: string
    }[],
    can_be_removed: boolean
};

export type OrdersInfoRefreshResponse = {
    update_settings: {
        update_period: number,
        order_nrs_to_update: string[]
    },
    orders: {
        order_nr: string,
        widgets: {
            general: {
                deeplink: string,
                name: string,
                date: string,
                currency: {
                    code: string,
                    sign: string,
                    template: string,
                    text: string
                },
                cost_value: string,
                status: {
                    color: {
                        theme: "light" | "dark",
                        value: string
                    }[],
                    text: string
                }
            },
            goods: {
                items: {
                    title: string,
                    image_url_pattern: string
                }[],
                total_items_number: number
            },
            tracking: {
                deeplink: string,
                title: string,
                subtitle: string,
                icons: {
                    status: string,
                    uri: string
                }[]
            }
        },
        swipe_left_actions: {
            remove: {
                swipe_text: string,
                background: {
                    theme: "light" | "dark",
                    value: string
                }[]
            }
        }
    }[]
};

export type OrdersResponse = Order[];

export type OrdersOrderResponse = Order & {
    cart: {
        extra_fees: {
            code: string,
            description: string,
            value: string
        }
    }
};

export type OrdersTrackingResponse = {
    source: string,
    meta: {
        /** Количество активных заказов */
        count: number,
        /** Время обновления (секунды) */
        checkAfter: number
    },
    payload: {
        trackedOrders: {
            status: string,
            title: string,
            description: string,
            ShortTitle: string,
            ShortDescription: string,
            eta: number | null,
            deliveryDate: string | null,
            /** Время обновления (секунды) */
            checkAfter: number,
            order: {
                orderNr: string,
                status: {
                    id: number,
                    date: string
                },
                location: {
                    latitude: number,
                    longitude: number
                },
                isAsap: boolean,
                deliveryTime: string,
                deliveryType: string,
                shippingType: string
            },
            place: {
                name: string,
                location: {
                    latitude: number,
                    longitude: number
                },
                address: string,
                locationLink: string,
                comment: string | null,
                placeSlug: string,
                placeBrandSlug: string
            },
            courier: {
                name: string,
                location: {
                    latitude: number,
                    longitude: number
                },
                isHardOfHearing: boolean,
                options: any[]
            } | null,
            contact: {
                type: string,
                phone: string
            },
            contacts: any[],
            time: number,
            createdAt: string,
            payment: null,
            service: string,
            clientApp: string,
            actions: any[],
            hide_statuses: boolean,
            statuses: {
                status: string,
                uri: string,
                payload: null
            }[],
            carInfo: {
                car_number: string,
                car_plate: {
                    type: string,
                    value: string
                }[],
                description_template: string,
                car_brand: string
            } | null
        }[]
    }
};