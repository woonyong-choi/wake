{{- define "candidate.image" -}}
{{- printf "%s@%s" (required "image repository required" .repository) (required "immutable image digest required" .digest) -}}
{{- end -}}
