/*  Authors:
 *    Adam Young <ayoung@redhat.com>
 *    Endi S. Dewata <edewata@redhat.com>
 *
 * Copyright (C) 2010 Red Hat
 * see file 'COPYING' for use and warranty information
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

define([
    './metadata',
    './ipa',
    './jquery',
    './phases',
    './reg',
    './text',
    './details',
    './search',
    './association',
    './entity'],
        function(metadata_provider, IPA, $, phases, reg, text) {

/**
 * Widgets, entities and fields related to Access Control that means
 * Permissions, Privilege, Role, Delegation and Self-service.
 *
 * @class aci
 * @singleton
 */
var aci = {};

/**
 * List of fields which are disabled for managed permissions
 * @property {Array}
 */
aci.managed_fields = [
    'ipapermright', 'extratargetfilter', 'memberof', 'ipapermlocation',
    'ipapermtarget', 'type'
];

var make_permission_spec = function() {

return {
    name: 'permission',
    facet_groups: ['settings', 'privilege'],
    facets: [
        {
            $type: 'search',
            columns: [ 'cn' ]
        },
        {
            $factory: aci.permission_details_facet,
            $type: 'details',
            fields: [
                {
                    name:'cn',
                    widget: 'identity.cn'
                },
                {
                    $type: 'radio',
                    name:'ipapermbindruletype',
                    widget: 'identity.ipapermbindruletype',
                    flags: ['w_if_no_aci']
                },
                {
                    $type: 'rights',
                    name: 'ipapermright',
                    widget: 'identity.ipapermright',
                    required: true,
                    flags: ['w_if_no_aci']
                },
                {
                    $type: 'multivalued',
                    name: 'extratargetfilter',
                    widget: 'target.extratargetfilter',
                    acl_param: 'ipapermtargetfilter',
                    enabled: false,
                    flags: ['w_if_no_aci']
                },
                {
                    $type: 'multivalued',
                    name: 'memberof',
                    widget: 'target.memberof',
                    enabled: false,
                    flags: ['w_if_no_aci']
                },
                {
                    name: 'ipapermlocation',
                    widget: 'target.ipapermlocation',
                    enabled: false,
                    flags: ['w_if_no_aci']
                },
                {
                    name: 'ipapermtarget',
                    widget: 'target.ipapermtarget',
                    enabled: false,
                    flags: ['w_if_no_aci']
                },
                {
                    $type: 'select',
                    name: 'type',
                    widget: 'target.type',
                    enabled: false,
                    flags: ['w_if_no_aci']

                },
                {
                    name: 'attrs',
                    widget: 'target.attrs',
                    enabled: false,
                    flags: ['w_if_no_aci']
                },
                {
                    name: 'attrs_multi',
                    param: 'attrs',
                    $type: 'multivalued',
                    widget: 'target.attrs_multi',
                    enabled: false,
                    flags: ['w_if_no_aci']
                },
                {
                    name: 'ipapermdefaultattr',
                    $type: 'multivalued',
                    widget: 'managed.ipapermdefaultattr'
                },
                {
                    name: 'ipapermincludedattr',
                    $type: 'multivalued',
                    widget: 'managed.ipapermincludedattr',
                    read_only: true
                },
                {
                    name: 'ipapermexcludedattr',
                    $type: 'multivalued',
                    widget: 'managed.ipapermexcludedattr',
                    read_only: true
                }
            ],
            widgets: [
                {
                    $type: 'details_section',
                    name: 'identity',
                    label: '@i18n:objects.permission.identity',
                    widgets: [
                        'cn',
                        {
                            $type: 'radio',
                            name: 'ipapermbindruletype',
                            options: ['permission', 'all', 'anonymous']
                        },
                        {
                            $type: 'rights',
                            name: 'ipapermright',
                            layout: 'columns'
                        }
                    ]
                },
                {
                    $type: 'permission_target',
                    container_factory: IPA.details_section,
                    label: '@i18n:objects.permission.target',
                    name: 'target'
                },
                {
                    $type: 'details_section',
                    name: 'managed',
                    label: '@i18n:objects.permission.managed',
                    widgets: [
                        {
                            $type: 'multivalued',
                            name: 'ipapermdefaultattr'
                        },
                        {
                            $type: 'multivalued',
                            name: 'ipapermincludedattr'
                        },
                        {
                            $type: 'multivalued',
                            name: 'ipapermexcludedattr'
                        }
                    ]
                }
            ],
            policies: [
                aci.permission_managed_policy,
                {
                    $factory: aci.permission_target_policy,
                    widget_name: 'target'
                }
            ]
        },
        {
            $type: 'association',
            name: 'member_privilege',
            facet_group: 'privilege'
        }
    ],
    adder_dialog: {
        height: 450,
        fields: [
            {
                name:'cn',
                widget: 'general.cn'
            },
            {
                $type: 'radio',
                name:'ipapermbindruletype',
                widget: 'general.ipapermbindruletype'
            },
            {
                $type: 'rights',
                name: 'ipapermright',
                widget: 'general.ipapermright',
                required: true
            },
            {
                $type: 'multivalued',
                name: 'extratargetfilter',
                widget: 'target.extratargetfilter',
                acl_param: 'ipapermtargetfilter',
                enabled: false
            },
            {
                $type: 'multivalued',
                name: 'memberof',
                widget: 'target.memberof',
                enabled: false
            },
            {
                name: 'ipapermlocation',
                widget: 'target.ipapermlocation',
                enabled: false
            },
            {
                name: 'ipapermtarget',
                widget: 'target.ipapermtarget',
                enabled: false
            },
            {
                $type: 'select',
                name: 'type',
                widget: 'target.type',
                enabled: false
            },
            {
                name: 'attrs',
                widget: 'target.attrs',
                enabled: false
            },
            {
                name: 'attrs_multi',
                $type: 'multivalued',
                param: 'attrs',
                widget: 'target.attrs_multi',
                enabled: false
            }
        ],
        widgets: [
            {
                $type: 'details_section',
                name: 'general',
                widgets: [
                    'cn',
                    {
                        $type: 'radio',
                        name: 'ipapermbindruletype',
                        options: ['permission', 'all', 'anonymous'],
                        default_value: 'permission'
                    },
                    {
                        $type: 'rights',
                        name: 'ipapermright',
                        layout: 'columns'
                    }
                ]
            },
            {
                $type: 'permission_target',
                name:'target'
            }
        ],
        policies: [
            {
                $factory: aci.permission_target_policy,
                widget_name: 'target'
            }
        ]
    }
};};

/**
 * @class aci.permission_details_facet
 * @extends details.details_facet
 */
aci.permission_details_facet = function(spec) {

    var that = IPA.details_facet(spec);

    that.get_refresh_command_name = function() {
        return that.entity.name+'_show_'+that.get_pkey();
    };

    return that;
};

var make_privilege_spec = function() {
return {
    name: 'privilege',
    facet_groups: ['permission', 'settings', 'role'],
    facets: [
        {
            $type: 'search',
            columns: [
                'cn',
                'description'
            ]
        },
        {
            $type: 'details',
            sections: [
                {
                    name: 'identity',
                    label: '@i18n:details.identity',
                    fields: [
                        'cn',
                        {
                            $type: 'textarea',
                            name: 'description'
                        }
                    ]
                }
            ]
        },
        {
            $type: 'association',
            name: 'member_role',
            facet_group: 'role',
            add_method: 'add_privilege',
            remove_method: 'remove_privilege',
            associator: IPA.serial_associator
        },
        {
            $type: 'association',
            name: 'memberof_permission',
            facet_group: 'permission',
            add_method: 'add_permission',
            remove_method: 'remove_permission',
            search_options: { 'ipapermbindruletype': 'permission' }
        }
    ],
    standard_association_facets: true,
    adder_dialog: {
        fields: [
            'cn',
            {
                $type: 'textarea',
                name: 'description'
            }
        ]
    }
};};

var make_role_spec = function() {
return {
    name: 'role',
    facet_groups: ['member', 'privilege', 'settings'],
    facets: [
        {
            $type: 'search',
            columns: [
                'cn',
                'description'
            ]
        },
        {
            $type: 'details',
            sections: [
                {
                    name: 'identity',
                    label: '@i18n:objects.role.identity',
                    fields: [
                        'cn',
                        {
                            $type: 'textarea',
                            name: 'description'
                        }
                    ]
                }
            ]
        },
        {
            $type: 'association',
            name: 'memberof_privilege',
            facet_group: 'privilege',
            add_method: 'add_privilege',
            remove_method: 'remove_privilege'
        }
    ],
    standard_association_facets: true,
    adder_dialog: {
        fields: [
            'cn',
            {
                $type: 'textarea',
                name: 'description'
            }
        ]
    }
};};

var make_selfservice_spec = function() {
return {
    name: 'selfservice',
    facets: [
        {
            $type: 'search',
            columns: [ 'aciname' ],
            pagination: false
        },
        {
            $type: 'details',
            check_rights: false,
            sections: [
                {
                    name: 'general',
                    label: '@i18n:details.general',
                    fields: [
                        'aciname',
                        {
                            $type: 'attributes',
                            object_type: 'user',
                            name: 'attrs'
                        }
                    ]
                }
            ]
        }
    ],
    adder_dialog: {
        fields: [
            'aciname',
            {
                $type: 'attributes',
                object_type: 'user',
                name: 'attrs'
            }
        ]
    }
};};


var make_delegation_spec = function() {
return {
    name: 'delegation',
    facets: [
        {
            $type: 'search',
            columns: [ 'aciname' ],
            pagination: false
        },
        {
            $type: 'details',
            check_rights: false,
            sections: [
                {
                    name: 'general',
                    label: '@i18n:details.general',
                    fields: [
                        'aciname',
                        {
                            $type: 'checkboxes',
                            name: 'permissions',
                            required: true,
                            options: IPA.create_options(['read', 'write'])
                        },
                        {
                            $type: 'entity_select',
                            name: 'group',
                            other_entity: 'group',
                            other_field: 'cn'
                        },
                        {
                            $type: 'entity_select',
                            name: 'memberof',
                            other_entity: 'group',
                            other_field: 'cn'
                        },
                        {
                            $type: 'attributes',
                            name: 'attrs',
                            object_type: 'user'
                        }
                    ]
                }
            ]
        }
    ],
    standard_association_facets: false,
    adder_dialog: {
        fields: [
            'aciname',
            {
                $type: 'checkboxes',
                name: 'permissions',
                options: IPA.create_options(['read', 'write'])
            },
            {
                $type: 'entity_select',
                name: 'group',
                other_entity: 'group',
                other_field: 'cn'
            },
            {
                $type: 'entity_select',
                name: 'memberof',
                other_entity: 'group',
                other_field: 'cn'
            },
            {
                $type: 'attributes',
                name: 'attrs',
                object_type: 'user'
            }
        ]
    }
};};

/**
 * @class aci.attributes_widget
 * @extends IPA.checkboxes_widget
 */
aci.attributes_widget = function(spec) {

    spec = spec || {};

    var that = IPA.checkboxes_widget(spec);

    that.object_type = spec.object_type;
    that.skip_unmatched = spec.skip_unmatched === undefined ? false : spec.skip_unmatched;

    var id = spec.name;

    that.create = function(container) {
        that.container = container;

        var attr_container = $('<div/>', {
            'class': 'aci-attribute-table-container'
        }).appendTo(container);

        that.$node = that.table = $('<table/>', {
            id: id,
            name: that.name,
            'class': 'search-table aci-attribute-table scrollable'
        }).
            append('<thead/>').
            append('<tbody/>').
            appendTo(attr_container);

        var tr = $('<tr></tr>').appendTo($('thead', that.table));

        var th = $('<th/>').appendTo(tr);
        IPA.standalone_option({
            type: "checkbox",
            click: function() {
                $('.aci-attribute', that.table).
                    prop('checked', $(this).prop('checked'));
                that.value_changed.notify([], that);
            }
        }, th);

        tr.append($('<th/>', {
            'class': 'aci-attribute-column',
            html: text.get('@i18n:objects.aci.attribute')
        }));

        if (that.undo) {
            that.create_undo(container);
        }

        if (that.object_type) {
            that.populate(that.object_type);
        }

        that.create_error_link(container);
    };

    that.create_options = function(options) {
        var tbody = $('tbody', that.table);

        for (var i=0; i<options.length ; i++){
            var option = options[i];
            var value = option.value.toLowerCase();
            var tr = $('<tr/>').appendTo(tbody);

            var td =  $('<td/>').appendTo(tr);
            var name = that.get_input_name();
            var id = that._option_next_id + name;
            var opt = IPA.standalone_option({
                id: id,
                type: 'checkbox',
                name: name,
                value: value,
                'class': 'aci-attribute',
                change: function() {
                    that.value_changed.notify([], that);
                }
            }, td);
            td = $('<td/>').appendTo(tr);
            td.append($('<label/>',{
                text: value,
                'for': id
            }));
            option.input_node = opt[0];
            that.new_option_id();
        }
    };

    that.update = function(values) {

        that.values = [];

        values = values || [];
        for (var i=0; i<values.length; i++) {

            var value = values[i];

            if (!value || value === '') continue;

            value = value.toLowerCase();
            that.values.push(value);
        }

        that.populate(that.object_type);
        that.append();
        that.create_options(that.options);
        that.owb_update(values);
    };

    that.populate = function(object_type) {

        $('tbody tr', that.table).remove();

        if (!object_type || object_type === '') return;

        var metadata = metadata_provider.get('@mo:'+object_type);
        if (!metadata) return;

        var aciattrs = metadata.aciattrs;

        that.options = that.prepare_options(aciattrs);
    };

    that.append = function() {

        if (!that.values) return;

        var unmatched = [];

        for (var i=0; i<that.values.length; i++) {
            if (!that.has_option(that.values[i])) {
                unmatched.push(that.values[i]);
            }
        }

        if (unmatched.length > 0 && !that.skip_unmatched) {
            that.options.push.apply(that.options, that.prepare_options(unmatched));
        }
    };

    that.has_option = function(value) {
        var o = that.options;
        for (var i=0, l=o.length; i<l; i++) {
            if (o[i].value === value) return true;
        }
        return false;
    };

    that.show_undo = function() {
        $(that.undo_span).css('display', 'inline-block');
    };

    return that;
};

/**
 * @class aci.rights_widget
 * @extends IPA.checkboxes_widget
 */
aci.rights_widget = function(spec) {

    var that = IPA.checkboxes_widget(spec);

    that.rights = ['read', 'search', 'compare', 'write', 'add', 'delete', 'all'];
    for (var i=0; i<that.rights.length; i++) {
        var right = that.rights[i];
        that.add_option({label: right, value: right});
    }

    return that;
};


/**
 * Default target to display in `permission_target_widget`
 * @property {string}
 */
aci.default_target = 'general';

/**
 * @class aci.permission_target_widget
 * @extends IPA.details_section
 */
aci.permission_target_widget = function(spec) {

    spec = spec || {};

    var factory = spec.container_factory || IPA.details_section;

    var that = factory(spec);

    that.group_entity = IPA.get_entity(spec.group_entity || 'group');

    that.target = aci.default_target;

    var init = function() {

        var objects = metadata_provider.get('@m:objects');
        var types = IPA.create_options(['']);
        for (var o in objects) {
            if (objects.hasOwnProperty(o)) {
                var obj = objects[o];
                if (obj.can_have_permissions) {
                    types.push({
                        label: obj.label_singular,
                        value: o
                    });
                }
            }
        }

        that.type_select = IPA.select_widget({
            entity: that.entity,
            name: 'type',
            hidden: true,
            options: types
        });
        that.widgets.add_widget(that.type_select);

        that.ipapermlocation_text = IPA.text_widget({
            entity: that.entity,
            name: 'ipapermlocation',
            hidden: true
        });
        that.widgets.add_widget(that.ipapermlocation_text);

        that.extratargetfilter_text = IPA.multivalued_widget({
            entity: that.entity,
            name: 'extratargetfilter',
            hidden: true
        });
        that.widgets.add_widget(that.extratargetfilter_text);

        that.ipapermtarget_text = IPA.text_widget({
            entity: that.entity,
            name: 'ipapermtarget',
            hidden: true
        });
        that.widgets.add_widget(that.ipapermtarget_text);

        that.memberof_select = IPA.multivalued_widget({
            name: 'memberof',
            entity: that.entity,
            hidden: true,
            child_spec: {
                $type: 'entity_select',
                other_entity: that.group_entity,
                other_field: 'cn'
            }
        });
        that.widgets.add_widget(that.memberof_select);


        that.attribute_table = aci.attributes_widget({
            entity: that.entity,
            name: 'attrs',
            object_type: types[0].name,
            hidden: true
        });
        that.widgets.add_widget(that.attribute_table);

        that.attribute_multivalued = IPA.multivalued_widget({
            entity: that.entity,
            name: 'attrs_multi',
            hidden: true
        });
        that.widgets.add_widget(that.attribute_multivalued);
    };

    init();

    return that;
};

/**
 * Permission target policy
 * @class aci.permission_target_policy
 * @extends IPA.facet_policy
 */
aci.permission_target_policy = function (spec) {

    var that = IPA.facet_policy();
    that.widget_name = spec.widget_name;
    that.managed = false;

    that.init = function() {

        that.permission_target = that.container.widgets.get_widget(that.widget_name);
        var type_select = that.permission_target.widgets.get_widget('type');

        type_select.value_changed.attach(function() {
            that.apply_type();
        });

        type_select.undo_clicked.attach(function() {
            that.apply_type();
        });
    };

    that.apply_type = function () {

        var widgets = that.permission_target.widgets;
        var type_select = widgets.get_widget('type');
        var type = type_select.save()[0];
        var new_target = type === '' ? 'general' : 'type';
        if (that.permission_target.target !== new_target) {

            var attr_table = widgets.get_widget('attrs');
            var attr_multi = widgets.get_widget('attrs_multi');
            var loc_w = widgets.get_widget('ipapermlocation');
            var loc_f = that.container.fields.get_field('ipapermlocation');
            var attrs;
            that.select_target(new_target);

            if (new_target === 'general') {
                attrs = attr_table.save();
                attr_multi.update(attrs);
                attr_multi.value_changed.notify([], attr_multi);

                // permission plugin resets ipapermlocation to basedn when
                // type is unset. -> use it as pristine value so undo will
                // work correctly.
                var loc = [IPA.env.basedn];
                loc_w.update(loc);
                loc_f.values = loc;
            } else {
                attrs = attr_multi.save();
                attr_table.update(attrs);
                // notification will be done by `set_attrs_type`
            }
        }

        that.set_attrs_type(type, true);
    };

    that.set_attrs_type = function(type, skip_unmatched) {
        var attribute_field = that.container.fields.get_field('attrs');
        var attribute_table = that.permission_target.widgets.get_widget('attrs');
        var skip_unmatched_org = attribute_table.skip_unmatched;
        attribute_table.object_type = type;
        // skip values which don't belong to new type. Bug #2617
        attribute_table.skip_unmatched =  skip_unmatched || skip_unmatched_org;
        attribute_field.reset();
        // force value_change to update dirty status if some unmatched values were skipped
        attribute_table.value_changed.notify([], attribute_table);
        attribute_table.skip_unmatched = skip_unmatched_org;
    };

    that.update_attrs = function() {

        var type_select = that.permission_target.widgets.get_widget('type');
        var type = type_select.save()[0];
        that.set_attrs_type(type, false);
    };

    that.post_create = function() {
        that.select_target(aci.default_target);
    };

    that.post_load = function(data) {

        var displayed_target = 'general';
        var permtype = data.result.result.ipapermissiontype;
        that.managed = permtype && permtype.indexOf("MANAGED") > -1;
        that.system = permtype && permtype.indexOf("SYSTEM") > -1 && permtype.length === 1;

        for (var target in that.target_mapping) {
            var property = that.target_mapping[target].property;
            if (property && data.result.result[property]) {
                displayed_target = target;
            } else {
                that.set_target_visible(target, false);
            }
        }

        if (displayed_target) {
            that.permission_target.target = displayed_target;
            that.set_target_visible(displayed_target, true);
        }
    };

    that.select_target = function(target) {
        that.set_target_visible(that.permission_target.target, false);
        that.permission_target.target = target;
        that.set_target_visible(that.permission_target.target, true);
    };

    that.set_target_visible = function(target, visible) {

        var target_info = that.target_mapping[target];

        for (var i=0,l=target_info.fields.length; i<l; i++) {
            var info = target_info.fields[i];
            that.set_target_row_visible(info, visible);
        }

        if (visible && target_info.action) target_info.action();
    };

    that.set_target_row_visible = function(target_info, visible) {
        var widget = that.permission_target.widgets.get_widget(target_info.name);
        var field = that.container.fields.get_field(target_info.name);
        that.permission_target.set_row_visible(target_info.name, visible);
        var managed_f = aci.managed_fields.indexOf(target_info.name) > -1;
        var enabled = !(managed_f && that.managed) && visible && !that.system;
        field.set_enabled(enabled);
        field.set_required(visible && target_info.required);
        widget.hidden = !visible;
    };

    that.target_mapping = {
        general: {
            fields: [
                {
                    name: 'extratargetfilter'
                },
                {
                    name: 'ipapermlocation',
                    required: true
                },
                {
                    name: 'ipapermtarget'
                },
                {
                    name: 'type'
                },
                {
                    name: 'memberof'
                },
                {
                    name: 'attrs_multi'
                }
            ]
        },
        type: {
            property: 'type',
            fields: [
                {
                    name: 'extratargetfilter'
                },
                {
                    name: 'memberof'
                },
                {
                    name: 'type'
                },
                {
                    name: 'attrs'
                },
                {
                    name: 'ipapermtarget'
                }
            ],
            action: function() {
                that.update_attrs();
            }
        }
    };


    return that;
};

/**
 * Facet policy which shows and hides managed section based on presence
 * "MANAGED" in ippapermissiontype attribute
 * @class aci.permission_managed_policy
 * @extends IPA.facet_policy
 */
aci.permission_managed_policy = function (spec) {

    var that = IPA.facet_policy();

    that.post_load = function(data) {
        var permtype = data.result.result.ipapermissiontype;
        var managed = permtype && permtype.indexOf("MANAGED") > -1;
        var system = permtype && permtype.indexOf("SYSTEM") > -1 && permtype.length === 1;
        var m_section = that.container.widgets.get_widget("managed");
        m_section.set_visible(managed);

        var fields = that.container.fields.get_fields();
        for (var i=0, l=fields.length; i<l; i++) {
            var field = fields[i];
            if (field.read_only) continue;
            var managed_f = aci.managed_fields.indexOf(field.name) > -1;
            field.set_enabled(!system && !(managed_f && managed));
        }
    };

    return that;
};

/**
 * Permission entity spec
 * @member aci
 */
aci.permission_entity_spec = make_permission_spec();

/**
 * Privilege entity spec
 * @member aci
 */
aci.privilege_entity_spec = make_privilege_spec();

/**
 * Role entity spec
 * @member aci
 */
aci.role_entity_spec = make_role_spec();

/**
 * Self-service entity spec
 * @member aci
 */
aci.selfservice_entity_spec = make_selfservice_spec();

/**
 * Delegation entity spec
 * @member aci
 */
aci.delegation_entity_spec = make_delegation_spec();

/**
 * Register entities, widgets and fields to global registers.
 * @member aci
 */
aci.register = function() {
    var e = reg.entity;
    var w = reg.widget;
    var f = reg.field;

    e.register({ type: 'permission', spec: aci.permission_entity_spec });
    e.register({ type: 'privilege', spec: aci.privilege_entity_spec });
    e.register({ type: 'role', spec: aci.role_entity_spec });
    e.register({ type: 'selfservice', spec: aci.selfservice_entity_spec });
    e.register({ type: 'delegation', spec: aci.delegation_entity_spec });

    w.register('attributes', aci.attributes_widget);
    f.register('attributes', IPA.checkboxes_field);
    w.register('rights', aci.rights_widget);
    f.register('rights', IPA.checkboxes_field);
    w.register('permission_target', aci.permission_target_widget);
};

phases.on('registration', aci.register);

return aci;
});