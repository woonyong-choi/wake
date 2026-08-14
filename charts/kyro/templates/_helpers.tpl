{{- define "kyro.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kyro.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else if eq .Release.Name (include "kyro.name" .) -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "kyro.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "kyro.labels" -}}
app.kubernetes.io/name: {{ include "kyro.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "kyro.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kyro.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "kyro.image" -}}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) -}}
{{- end -}}

{{- define "kyro.consoleImage" -}}
{{- printf "%s:%s" .Values.console.image.repository (.Values.console.image.tag | default .Chart.AppVersion) -}}
{{- end -}}

{{- define "kyro.accessMode" -}}
{{- $requested := .Values.access.mode -}}
{{- if ne $requested "auto" -}}
{{- $requested -}}
{{- else if eq .Values.service.type "LoadBalancer" -}}
loadbalancer
{{- else if eq .Values.service.type "NodePort" -}}
nodeport
{{- else -}}
{{- $ingressClasses := (lookup "networking.k8s.io/v1" "IngressClass" "" "") | default dict -}}
{{- $ingressItems := (get $ingressClasses "items") | default list -}}
{{- if and .Values.access.host (gt (len $ingressItems) 0) -}}
ingress
{{- else -}}
{{- $nodes := (lookup "v1" "Node" "" "") | default dict -}}
{{- $nodeItems := (get $nodes "items") | default list -}}
{{- $cloud := false -}}
{{- range $node := $nodeItems -}}
{{- $providerID := dig "spec" "providerID" "" $node -}}
{{- if regexMatch "^(aws|gce|azure)://" $providerID -}}
{{- $cloud = true -}}
{{- end -}}
{{- end -}}
{{- if $cloud -}}loadbalancer{{- else -}}portforward{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "kyro.serviceType" -}}
{{- $mode := include "kyro.accessMode" . | trim -}}
{{- if eq $mode "loadbalancer" -}}LoadBalancer
{{- else if eq $mode "nodeport" -}}NodePort
{{- else -}}ClusterIP
{{- end -}}
{{- end -}}

{{- define "kyro.externalUrl" -}}
{{- $configured := .Values.access.externalUrl | trim | trimSuffix "/" -}}
{{- if $configured -}}
{{- $configured -}}
{{- else if and (eq (include "kyro.accessMode" . | trim) "ingress") .Values.access.host -}}
{{- if .Values.access.ingress.tls.enabled -}}https{{- else -}}http{{- end -}}://{{ .Values.access.host }}
{{- end -}}
{{- end -}}

{{- define "kyro.internalUrl" -}}
http://{{ include "kyro.fullname" . }}.{{ .Release.Namespace }}.svc
{{- end -}}

{{- define "kyro.managementBaseUrl" -}}
{{- include "kyro.externalUrl" . | trim | default (include "kyro.internalUrl" . | trim) -}}
{{- end -}}

{{- define "kyro.cookieSecure" -}}
{{- if hasPrefix "https://" (include "kyro.externalUrl" . | trim) -}}1{{- else -}}0{{- end -}}
{{- end -}}

{{- define "kyro.validateAccess" -}}
{{- $mode := include "kyro.accessMode" . | trim -}}
{{- $externalUrl := include "kyro.externalUrl" . | trim -}}
{{- if and (eq $mode "loadbalancer") (hasPrefix "https://" $externalUrl) (ne .Values.access.loadBalancer.tlsTermination "external") -}}
{{- fail "HTTPS load-balancer access requires access.loadBalancer.tlsTermination=external to acknowledge external TLS termination" -}}
{{- end -}}
{{- end -}}
