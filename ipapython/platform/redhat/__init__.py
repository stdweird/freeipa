# Authors: Simo Sorce <ssorce@redhat.com>
#          Alexander Bokovoy <abokovoy@redhat.com>
#
# Copyright (C) 2007-2011   Red Hat
# see file 'COPYING' for use and warranty information
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.    See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#

import os
import socket
import stat
import sys

from ipapython import ipautil
from ipapython.platform import base
from ipapython.platform.redhat.auth import RedHatAuthConfig
from ipapython.platform.redhat.service import redhat_service, RedHatServices

# All what we allow exporting directly from this module
# Everything else is made available through these symbols when they are
# directly imported into ipapython.services:
#
# authconfig -- class reference for platform-specific implementation of
#               authconfig(8)
# service    -- class reference for platform-specific implementation of a
#               PlatformService class
# knownservices -- factory instance to access named services IPA cares about,
#                  names are ipapython.services.wellknownservices
# backup_and_replace_hostname -- platform-specific way to set hostname and
#                                make it persistent over reboots
# restore_network_configuration -- platform-specific way of restoring network
#                                  configuration (e.g. static hostname)
# restore_context -- platform-sepcific way to restore security context, if
#                    applicable
# check_selinux_status -- platform-specific way to see if SELinux is enabled
#                         and restorecon is installed.
__all__ = ['authconfig', 'service', 'knownservices',
    'backup_and_replace_hostname', 'restore_context', 'check_selinux_status',
    'restore_network_configuration', 'timedate_services', 'FIREFOX_EXEC',
    'FIREFOX_INSTALL_DIRS', 'FIREFOX_PREFERENCES_REL_PATH']

# Just copy a referential list of timedate services
timedate_services = list(base.timedate_services)

authconfig = RedHatAuthConfig
service = redhat_service
knownservices = RedHatServices()

def restore_context(filepath, restorecon='/sbin/restorecon'):
    """
    restore security context on the file path
    SELinux equivalent is /path/to/restorecon <filepath>

    restorecon's return values are not reliable so we have to
    ignore them (BZ #739604).

    ipautil.run() will do the logging.
    """
    try:
        if (os.path.exists('/usr/sbin/selinuxenabled')):
            ipautil.run(["/usr/sbin/selinuxenabled"])
        else:
            # No selinuxenabled, no SELinux
            return
    except ipautil.CalledProcessError:
        # selinuxenabled returns 1 if not enabled
        return

    if (os.path.exists(restorecon)):
        ipautil.run([restorecon, filepath], raiseonerr=False)

def backup_and_replace_hostname(fstore, statestore, hostname):
    old_hostname = socket.gethostname()
    try:
        ipautil.run(['/bin/hostname', hostname])
    except ipautil.CalledProcessError, e:
        print >>sys.stderr, "Failed to set this machine hostname to %s (%s)." % (hostname, str(e))
    replacevars = {'HOSTNAME':hostname}

    filepath = '/etc/sysconfig/network'
    if not os.path.exists(filepath):
        # file doesn't exist; create it with correct ownership & mode
        open(filepath, 'a').close()
        os.chmod(filepath,
            stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
        os.chown(filepath, 0, 0)
    old_values = ipautil.backup_config_and_replace_variables(
        fstore, filepath, replacevars=replacevars)
    restore_context("/etc/sysconfig/network")

    if 'HOSTNAME' in old_values:
        statestore.backup_state('network', 'hostname', old_values['HOSTNAME'])
    else:
        statestore.backup_state('network', 'hostname', old_hostname)

def check_selinux_status(restorecon='/sbin/restorecon'):
    """
    We don't have a specific package requirement for policycoreutils
    which provides restorecon. This is because we don't require
    SELinux on client installs. However if SELinux is enabled then
    this package is required.

    This function returns nothing but may raise a Runtime exception
    if SELinux is enabled but restorecon is not available.
    """
    try:
        if (os.path.exists('/usr/sbin/selinuxenabled')):
            ipautil.run(["/usr/sbin/selinuxenabled"])
        else:
            # No selinuxenabled, no SELinux
            return
    except ipautil.CalledProcessError:
        # selinuxenabled returns 1 if not enabled
        return

    if not os.path.exists(restorecon):
        raise RuntimeError('SELinux is enabled but %s does not exist.\nInstall the policycoreutils package and start the installation again.' % restorecon)

def restore_network_configuration(fstore, statestore):
    filepath = '/etc/sysconfig/network'
    if fstore.has_file(filepath):
        fstore.restore_file(filepath)

# Firefox paths
FIREFOX_EXEC = base.FIREFOX_EXEC
FIREFOX_INSTALL_DIRS = base.FIREFOX_INSTALL_DIRS
FIREFOX_PREFERENCES_REL_PATH = base.FIREFOX_PREFERENCES_REL_PATH
