# Authors:
#   Jan Cholasta <jcholast@redhat.com>
#
# Copyright (C) 2014  Red Hat
# see file 'COPYING' for use and warranty information
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

from ipaserver.install.plugins.baseupdate import PostUpdate
from ipalib import errors
from ipalib.plugable import Registry
from ipapython import certmonger
from ipapython.dn import DN

register = Registry()

@register()
class update_ca_renewal_master(PostUpdate):
    """
    Set CA renewal master in LDAP.
    """

    def execute(self, **options):
        ldap = self.obj.backend
        base_dn = DN(('cn', 'masters'), ('cn', 'ipa'), ('cn', 'etc'),
                     self.api.env.basedn)
        filter = '(&(cn=CA)(ipaConfigString=caRenewalMaster))'
        try:
            entries = ldap.get_entries(base_dn=base_dn, filter=filter,
                                       attrs_list=[])
        except errors.NotFound:
            pass
        else:
            self.debug("found CA renewal master %s", entries[0].dn[1].value)
            return (False, False, [])

        criteria = (
            ('cert_storage_location', '/etc/httpd/alias', certmonger.NPATH),
            ('cert_nickname', 'ipaCert', None),
        )
        request_id = certmonger.get_request_id(criteria)
        if request_id is None:
            self.error("certmonger request for ipaCert not found")
            return (False, False, [])
        ca_name = certmonger.get_request_value(request_id, 'ca_name')
        if ca_name is None:
            self.error("certmonger request for ipaCert is missing ca_name")
            return (False, False, [])
        ca_name = ca_name.strip()

        if ca_name == 'dogtag-ipa-renew-agent':
            dn = DN(('cn', 'CA'), ('cn', self.api.env.host), base_dn)
            update = {
                dn: {
                    'dn': dn,
                    'updates': ['add:ipaConfigString: caRenewalMaster'],
                },
            }
            return (False, True, [update])
        elif ca_name == 'dogtag-ipa-retrieve-agent-submit':
            return (False, False, [])
        elif ca_name == 'dogtag-ipa-ca-renew-agent':
            return (False, False, [])
        else:
            self.warning(
                "certmonger request for ipaCert has unknown ca_name \"%s\", "
                "assuming local CA is renewal slave", ca_name)
            return (False, False, [])
