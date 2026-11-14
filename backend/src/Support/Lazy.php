<?php

namespace App\Support;

/**
 * Proxy perezoso: construye el objeto real solo la primera vez que se llama a
 * uno de sus métodos.
 *
 * index.php instanciaba ~50 controladores en cada petición y sus constructores
 * ejecutan ~150 consultas (CREATE TABLE IF NOT EXISTS, ALTER, CREATE INDEX...).
 * Con este proxy cada petición solo paga el coste del controlador que usa.
 */
final class Lazy
{
    /** @var callable */
    private $factory;
    private ?object $instance = null;

    public function __construct(callable $factory)
    {
        $this->factory = $factory;
    }

    public function instance(): object
    {
        return $this->instance ??= ($this->factory)();
    }

    public function __call(string $method, array $args): mixed
    {
        return $this->instance()->$method(...$args);
    }
}
