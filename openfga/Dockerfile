# The official openfga/openfga image has no default CMD (its ENTRYPOINT is
# just /openfga, which prints help and exits with no args if given nothing
# to run) - Render's image-runtime service type has no CLI-exposed way to
# override a container's command reliably, so this thin wrapper bakes in
# `run` as the default command. The image has no shell (distroless base),
# so this uses exec-form CMD rather than an entrypoint script - schema
# migrations are run separately as a one-off job (`openfga migrate`)
# against the same image, not automatically on every startup.
FROM openfga/openfga:latest
CMD ["run"]
