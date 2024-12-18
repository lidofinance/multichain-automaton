get_env_var() {
    local var_name=$1

    if [[ ! -f .env ]]; then
        echo "Error: .env file not found!" >&2
        return 1
    fi

    local var_value=$(grep -E "^${var_name}=" .env | cut -d '=' -f2- | xargs)

    if [[ -z "$var_value" ]]; then
        echo "Error: Variable ${var_name} not found in .env" >&2
        return 1
    fi

    echo "$var_value"
}
