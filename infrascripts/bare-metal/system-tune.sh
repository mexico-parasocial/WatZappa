#!/bin/bash
# PARA Bare-Metal System Tuning
# Run once on machine before first deploy

set -euo pipefail

echo "🔧 Tuning Linux kernel for 300k concurrent connections..."

# Backup current sysctl
cp /etc/sysctl.conf /etc/sysctl.conf.backup.$(date +%s)

cat >> /etc/sysctl.conf <<'EOF'

# PARA Network Tuning
net.ipv4.tcp_max_tw_buckets = 2000000
net.ipv4.tcp_fin_timeout = 10
net.ipv4.tcp_keepalive_time = 1200
net.ipv4.tcp_max_syn_backlog = 65536
net.ipv4.tcp_timestamps = 0
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65536
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_tw_recycle = 0
net.netfilter.nf_conntrack_max = 2000000

# Memory
vm.swappiness = 10
vm.dirty_ratio = 40
vm.dirty_background_ratio = 10
EOF

sysctl -p

# Ulimits for Docker
cat > /etc/security/limits.d/para.conf <<'EOF'
* soft nofile 1048576
* hard nofile 1048576
* soft nproc 1048576
* hard nproc 1048576
root soft nofile 1048576
root hard nofile 1048576
EOF

# Docker daemon tuning
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 1048576,
      "Soft": 1048576
    }
  }
}
EOF

systemctl restart docker

echo "✅ System tuned. Reboot recommended."
